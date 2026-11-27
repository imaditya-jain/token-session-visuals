# Reels (customer photos and short videos)

Customers post a **photo** (a *post*, up to 2 MB, stays up) or a **video** (a *reel*, up to 30 seconds and 5 MB,
**deleted 24 hours after it goes live, file included**) about gardening, home planting or landscaping, link up to
four products from the shop, and other customers like, comment and follow. An admin approves everything before it
appears. The creator lives in the Expo app (`fernwood-app`); the website has the public `/reels` page, the API and
the moderation page (`/admin/reels`).

## Who can see what

- **Everyone, signed in or not**, can watch live posts and reels of **public** accounts (app and website). Liking,
  commenting, following and posting need an account.
- Each account is **public or private** (Account > Private account). A private account's posts and reels are
  invisible (a plain 404, nothing reveals they exist) to everyone it has not accepted as a follower. Following a
  private account sends a request the owner accepts or declines; switching to public accepts waiting requests.
- **Feed order (Instagram style):** items from people you follow first, newest first, then everyone else's.
- Authors are named in the API by a random public handle (`authorKey`), never the account id, and files are filed
  under that handle too, so a public file address cannot be linked to an account.
- Accounts are isolated: every write is scoped to the caller's own account taken from the token; follow requests can
  only be answered by the account they were addressed to; reports, likes and follows are per person.

## How it works

1. `POST /api/reels` checks the person (signed in, mailbox verified, 10 posts per day), the limits and the linked
   products, saves the reel as `uploading` and returns a **one-time signed upload address** for exactly one file.
2. The app sends the file straight to Supabase Storage with that address. The service-role key never leaves the
   server and nothing large passes through our functions (Vercel caps bodies at 4.5 MB).
3. `POST /api/reels/:id/complete` measures the stored file and reads its first bytes. The declared size and type are
   only claims: a wrong size or a file that isn't really a JPEG/PNG/WebP/MP4/MOV is deleted and refused. A good file
   moves the reel to `pending`.
4. (Admin) An admin with `reels:moderate` approves, rejects or removes it (every decision is audited). Three different
   people reporting a live reel pull it back to `pending`.
5. Abandoned uploads (no `complete` within an hour) are removed by the cron sweep, with their files. Deleting an
   account removes its reels, likes, comments and files.

Accounts, comments, likes and reports stay in MongoDB; Supabase is used for file storage only.

## Set up Supabase (once per environment)

1. Create a project, then **Storage > New bucket**: name `reels`, **Public bucket ON**, file size limit **5 MB**,
   allowed MIME types `image/jpeg, image/png, image/webp, video/mp4, video/quicktime`.
   No storage policies are needed: uploads use signed URLs created with the service-role key. Public means
   anyone who has a file's address can read it; addresses contain a random id and are only handed out for
   approved reels (and to the author).
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project settings > API; **never** put it in the app) and
   optionally `SUPABASE_REELS_BUCKET`. **`SUPABASE_URL` must be set in the environment that BUILDS the site**: the
   Content-Security-Policy allows that one origin for images and video (`next.config.ts`).
3. Without these settings the API answers `503 reels_not_configured` and the app shows "coming soon".

## Limits that cannot be checked on the server

The 30-second length is read by the app from the picked file (the app refuses longer videos) and sent as a
declared value (the server rejects anything over 30 s). The server cannot measure a video's real duration without a
media tool, so the 5 MB size limit, the content check and moderation are the real guards. The app does not compress
videos: one over 5 MB is refused with a message; pictures are shrunk automatically to fit 2 MB.

## Not built

Video thumbnails (the app shows the first frame), following/feeds per person, reel analytics, comment replies and
editing a reel after posting.
