// RFC 9728 puts a resource's metadata at /.well-known/oauth-protected-resource + the resource's
// own path, and MCP clients try that form before the bare one. Without this route the path
// fell through to the login redirect, an HTML page where the client expected JSON.
export { GET, OPTIONS } from '../../route'
