# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds: the InvenTree address and an API token, kept by
Gladys in the integration configuration (never logged, never written to
`/data`). `/data` holds a small JSON file listing what the scene triggers
already announced (InvenTree part and purchase order ids) and the address of
the InvenTree server they belong to. The container only talks to the InvenTree
address, over HTTP or HTTPS. It only reads, except the "Remove stock" scene
action, which is disabled unless enabled in the configuration. Use the token of
a dedicated user with the view roles only when no scene removes stock, and HTTPS
when InvenTree is not on your local network.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and InvenTree itself (see the
[InvenTree security policy](https://github.com/inventree/InvenTree/security/policy)).
