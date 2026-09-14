# Outreach drafts — not sent

## Who to ask first

Start with two or three people who already use Zen for development, then seek a small group through the Zen community. Coworkers can help find installation bugs, but people who do not use Zen or do not need a persistent URL are a weak measure of demand. Give them one short task and an easy way to decline.

After a few days, ask whether testers kept it enabled and in which workflow. Separate “couldn't install it,” “didn't need it,” and “stopped because of a bug.” Those answers are more useful than stars or upvotes.

## Reddit recommendation and rules check

Checked September 14, 2026: the [r/zen_browser sidebar](https://www.reddit.com/r/zen_browser/) requires English, Zen-related content, respectful interaction, and substantive posts. Rule 5 restricts third-party tooling assistance and directs issues to the original authors. The feed also contains author demonstrations and feedback requests. That is evidence of a possible audience, not a guarantee a new mod announcement will be allowed.

Use one concrete demo and a small tester request, with support routed to this repository. Recheck the live rules and applicable flair before posting. Because rule 5 is broad, asking moderators whether a beta showcase fits is reasonable if its application is unclear. Do not repost a removed announcement without resolving the reason.

[Reddiquette](https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette) recommends checking community rules, factual titles, and original sources; it discourages flooding and vote solicitation. Do not ask coworkers to upvote the post.

## Optional moderator message

Hi — I maintain a small developer-toolbar mod for Zen. I'd like to post one short demo and invite a few developers to test the beta. It uses userChrome JavaScript via fx-autoconfig, and I'd direct all installation questions and bug reports to its GitHub repository. Would that fit the community rules, particularly rule 5, and which flair would you prefer?

## Reddit post draft

**Title:** I made an Arc-style dev URL bar for Zen — looking for a few beta testers

I wanted the full URL visible while working on localhost and staging sites, so I built a small developer toolbar for Zen. The code has been on GitHub for a while, and I am preparing an updated beta for more people to try.

It shows an editable URL above the page with native suggestions and a viewport readout. This update adds remembered Automatic / Always on / Always off choices for each HTTP(S) origin while keeping custom-host rules and developer-tool actions.

[Attach a real 15–30 second demo: open localhost, edit a path, enable a staging origin, then switch to an ordinary site. Use dummy URLs.]

This is a userChrome JavaScript mod installed with fx-autoconfig, separate from the Zen Mods store. **Tested on:** [exact Zen version and OS from the completed test record]. **Known issues:** [actual findings and untested combinations].

I'd like a few people who already develop in Zen to try it on their normal localhost or staging workflow. The most helpful feedback is whether it earns its space, whether installation is clear, and what breaks in compact mode or split view.

Code, installation/removal instructions, and beta download: [GitHub](https://github.com/DannyAmzq/zen-dev-url) — add the actual 1.2.0-beta.1 prerelease link once published. Please report bugs in GitHub Issues so I can track them; no need to use Zen's support channels for this mod.

If you already use Zen for development, would you keep a bar like this enabled? What would make you turn it off?

## Coworker message draft

Hey — I'm getting the Zen dev URL bar ready for a small beta. If you're using Zen for local development, would you have ten minutes to test it? [GitHub](https://github.com/DannyAmzq/zen-dev-url) — replace with the new beta link after publication

The test is: install it, open your localhost app, turn it on for one staging site, restart Zen, and check that the choice stuck. The guide also explains how to remove it. Let me know your Zen version and anything confusing or broken.

No pressure if you don't use Zen or don't need this workflow — that helps me find the right testers too.

## Follow-up after testing

Thanks for trying it. Did you leave it enabled? If you removed it, was that because of installation trouble, a bug, the space it takes, or because you didn't need it? A short answer is enough.
