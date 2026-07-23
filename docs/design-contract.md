# Website design contract

## Outcome and audience

For high-agency AI engineers whose working capability is distributed across
several agent tools, make the hidden environment legible and give them a
credible, low-risk path to install the read-only inspector.

The primary observable outcome is a successful journey from landing page to
verified local `agentctl inspect` output. The business purpose is to establish
agentctl as an open-source justREPL project and attract technically serious
users and contributors.

## Scope

The design object spans a public product landing page, getting-started
documentation, security explanation, installer endpoint, and the transition
into a local CLI. It is not a dashboard, hosted control plane, account flow, or
marketplace.

## Domain objects and hierarchy

1. Product identity and present release status.
2. Installation command.
3. Inspection report and its findings.
4. Supported target environments.
5. Truth model.
6. Safety properties.
7. Open-source repository.
8. justREPL provenance.

The installation command is the primary action. Reading documentation and
opening GitHub are secondary actions. No destructive action exists on the site.

## Task flow

1. Arrive and understand the category and current capability.
2. Inspect the exact installation command and its consequences.
3. Copy it with keyboard, pointer, or manual text selection.
4. Run the command locally.
5. Run `agentctl inspect`.
6. Interpret the report or open the docs/security model.
7. Inspect source or contribute on GitHub.

Copy success is announced in a persistent-enough inline status, not only a
transient toast. Without JavaScript, the command remains selectable and usable.

## State and recovery

- Initial: primary promise, current-release label, command, and next step visible.
- Copy success: button label and live status confirm what was copied.
- Copy failure: text remains selectable and the status explains manual recovery.
- Narrow viewport: navigation wraps or collapses without hiding GitHub or install.
- Reduced motion: scanning and reveal effects stop.
- Missing JavaScript: all content, navigation, and installation remain functional.
- 404: explains the missing path and offers Home, Docs, and GitHub recovery.

## Visual system

The site inherits justREPL's paper, ink, teal, serif-display, and mono-tooling
language while shifting the density toward an operator's technical field guide.

- Paper surfaces communicate authored specification.
- Dark editor surfaces communicate observed machine state.
- Teal marks active, trustworthy control—not generic AI magic.
- Warm amber marks risk and capability loss.
- Rules, coordinates, hashes, and narrow metadata create an audit-document
  texture rather than card-heavy SaaS chrome.
- Editorial serif headlines humanize the system; monospaced labels and output
  carry operational evidence.

The focal path is promise → install → observed output → architecture → trust.

## Responsive and accessibility contract

- Semantic landmarks and one H1 per page.
- Skip link and logical heading order.
- Native links and buttons with visible focus.
- Copy state exposed through an `aria-live` region.
- Minimum 44px primary targets.
- No meaning conveyed by color alone.
- Text reflows at 320 CSS pixels and 200% zoom.
- Command blocks scroll without shrinking below legibility.
- Motion is optional and disabled under `prefers-reduced-motion`.
- Contrast is checked in both paper and editor surfaces.

## Trust and content

- No fake metrics, customers, stars, testimonials, or security claims.
- “Read-only” describes `inspect` and `doctor`, not all future commands.
- Planned features are labeled as roadmap.
- The curl command links to a human-readable installer source and security page.
- No analytics, cookies, remote fonts, or third-party runtime scripts.
- GitHub and justREPL ownership remain visible.

## Validation

- Build and link checker.
- HTML semantics and asset presence checks.
- Keyboard and responsive browser inspection.
- Local static-asset runtime verification.
- Production checks for HTML, `/install.sh`, security headers, 404 behavior,
  canonical URLs, robots, sitemap, and GitHub navigation.
