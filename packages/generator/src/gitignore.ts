/** FR-SEC-003: excludes local secret files from the generated package's own repo, if the user puts one under version control. */
export const GITIGNORE_CONTENT = `node_modules/
.env
.env.*
!.env.example
*.log
`;
