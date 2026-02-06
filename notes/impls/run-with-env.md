# Run with env

A simple CLI that is called with a command, npx style, e.g., `cli-tool-name -- ...cmds`
It will look through the directory for `.env...` files and list them
The user should have a way to move up and down through the entries to select one (may need to install a new package that provides this functionality)
The cmd passed will be run with the selected env using `env-cmd` or something better
It should pipe io to CLI
If there's no env, it should fail with an error
Suggest a good name for the tool
Add it to forerunners bin/cli as a sub-program and document it in readme
