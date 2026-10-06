// Forgebase.exe — portable launcher. Runs the bundled Node.js runtime with the
// app's launcher script from the folder this executable lives in. Needs no
// admin rights and writes nothing outside its own folder and the user's data
// folder.
//
// The "slim" download leaves the runtime out (to keep the file small). In that
// case the official Node.js build is fetched once from nodejs.org, verified
// against its published SHA-256, and kept in runtime/ next to this executable.
package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// Set at build time by desktop/build.sh (-ldflags -X).
var (
	nodeZipURL    = ""
	nodeZipSHA256 = ""
	nodeZipEntry  = "" // path of node.exe inside the zip
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail(err)
	}
	dir := filepath.Dir(exe)
	node := filepath.Join(dir, "runtime", "node")
	if runtime.GOOS == "windows" {
		node += ".exe"
	}
	script := filepath.Join(dir, "app", "launcher.cjs")
	if _, err := os.Stat(script); err != nil {
		fail(fmt.Errorf("missing %s — keep Forgebase.exe inside the extracted Forgebase folder", script))
	}
	if _, err := os.Stat(node); err != nil {
		if nodeZipURL == "" {
			fail(fmt.Errorf("missing %s — keep Forgebase.exe inside the extracted Forgebase folder", node))
		}
		if err := fetchRuntime(node); err != nil {
			fail(fmt.Errorf("could not download the Node.js runtime: %v\n  Check your internet connection and try again", err))
		}
	}
	cmd := exec.Command(node, script)
	cmd.Dir = filepath.Join(dir, "app")
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			os.Exit(ee.ExitCode())
		}
		fail(err)
	}
}

func fetchRuntime(node string) error {
	fmt.Println()
	fmt.Println("  First launch: downloading the Node.js runtime from nodejs.org (about 30 MB, one time only)…")
	if err := os.MkdirAll(filepath.Dir(node), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(node), "node-*.zip")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	res, err := http.Get(nodeZipURL)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", nodeZipURL, res.Status)
	}
	hash := sha256.New()
	size, err := io.Copy(io.MultiWriter(tmp, hash), res.Body)
	if err != nil {
		return err
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != nodeZipSHA256 {
		return fmt.Errorf("checksum mismatch (got %s, want %s)", got, nodeZipSHA256)
	}

	zr, err := zip.NewReader(tmp, size)
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		if f.Name != nodeZipEntry {
			continue
		}
		src, err := f.Open()
		if err != nil {
			return err
		}
		defer src.Close()
		part := node + ".part"
		dst, err := os.OpenFile(part, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			return err
		}
		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			return err
		}
		if err := dst.Close(); err != nil {
			return err
		}
		fmt.Println("  Runtime ready.")
		return os.Rename(part, node)
	}
	return fmt.Errorf("%s not found in the download", nodeZipEntry)
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "\n  Forgebase could not start: %v\n\n  Press Enter to close.", err)
	fmt.Scanln()
	os.Exit(1)
}
