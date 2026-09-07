# Product workspaces

Every product lives in `projects/<project-slug>/` relative to this repository. This is a workspace folder, not an HTTP route or a drive-root directory.

Build approval creates a project directory and `project.json` through the agency. Build tasks receive that working directory. Each product must own its package.json, lockfile, src, public assets, tests, .env.example, data and deployment configuration. Never depend on agency source files or its credentials/database. Use a separate database per deployment.

Deploy CleanCircuit with the platform's root directory set to `projects/cleancircuit`. Deploy the agency separately from the repository root. Generated directories on ephemeral cloud disks require persistent storage or committing through the development workflow.
