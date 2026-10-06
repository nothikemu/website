// Forgebase.exe — portable launcher. Runs the bundled Node.js runtime with the
// app's launcher script from the folder this executable lives in. Needs no
// admin rights and writes nothing outside the user's own data folder.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	if _, err := os.Stat(node); err != nil {
		fail(fmt.Errorf("missing %s — keep Forgebase.exe inside the extracted Forgebase folder", node))
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

func fail(err error) {
	fmt.Fprintf(os.Stderr, "\n  Forgebase could not start: %v\n\n  Press Enter to close.", err)
	fmt.Scanln()
	os.Exit(1)
}
