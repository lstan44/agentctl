# Contributing to agentctl

Thank you for improving the open agent environment ecosystem.

## Start here

```sh
git clone https://github.com/lstan44/agentctl.git
cd agentctl
npm install
npm run check
```

Keep pull requests narrow. Adapter claims, trust-boundary changes, filesystem
writes, secret handling, and installer changes require tests and an explicit
failure/recovery analysis.

## Commit sign-off

Contributions use the [Developer Certificate of Origin](https://developercertificate.org/).
Sign commits with:

```sh
git commit -s
```

## Pull-request evidence

Describe:

- the user outcome;
- current and proposed behavior;
- security and compatibility implications;
- tests run;
- manual/runtime evidence;
- rollback or migration behavior when applicable.

Never include real credentials, private configuration, session history, or
unredacted home-directory fixtures.

## Conduct

Be direct, kind, evidence-oriented, and respectful. Harassment, discrimination,
threats, doxxing, and intentionally unsafe contributions are not accepted.
Maintainers may remove content or participation that harms the community.
