# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue. You can expect a first answer within five working days.

## Scope

The app keeps the Gemini key server-side, screens input with Prompt Shields when configured, validates every tool call and keeps an audit trail. The controls are listed in the [README](README.md#security).

Keys belong in `.env`, which git ignores. The one key-shaped string in the tests is assembled at runtime to test the secret check (`SEC-01`) and is not a credential.
