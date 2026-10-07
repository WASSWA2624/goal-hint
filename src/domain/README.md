# Shared domain

Place environment-independent types, schemas and pure business rules here as
their owning prompts require them. This is the common contract for web, server
and worker code. Do not import React, Next.js, server services, workers, browser
APIs, Node built-ins or read environment variables here. Provider payloads and
database clients belong in the server layer. No speculative market types are
introduced by the foundation.
