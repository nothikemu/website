FORGEBASE — PORTABLE EDITION
============================

No installation and no administrator rights required.

START
  1. Extract this whole "Forgebase" folder somewhere you own, e.g.
     Desktop or Documents. (Don't run it from inside the .zip.)
  2. Double-click Forgebase.exe.
     - If Windows SmartScreen says "Windows protected your PC", click
       "More info" → "Run anyway". (The app isn't code-signed.)
     - If the firewall asks, you can click Cancel: Forgebase only listens
       on your own computer (localhost).
  3. A black window opens. The first launch takes a little longer while
     it creates the database and loads the demo project. Your browser
     then opens at http://localhost:3737.

SIGN IN
  Demo account:  demo@forgebase.dev  /  forgebase-demo
  Or click "Get started" to create your own account.

  This edition doesn't send real emails. Verification links, password
  resets and invitations are printed in the black window instead.

STOP
  Close the black window.

YOUR DATA
  Stored in  %LOCALAPPDATA%\Forgebase  (database, uploaded files, settings).
  It survives updates: replace this folder with a newer version and your
  data stays. To start completely fresh, delete that folder.
  To uninstall, delete this folder and %LOCALAPPDATA%\Forgebase.

SHARING WITH TEAMMATES
  This edition runs on one computer. Teammates can't reach it from their
  own machines. For a shared team workspace, deploy the server version
  (see README.md in the source repository).
