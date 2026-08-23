import { google } from "googleapis";

function oauth() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REDIRECT_URI) throw new Error("YouTube OAuth is not configured.");
  return new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI);
}
export function youtubeAuthUrl() { return oauth().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["https://www.googleapis.com/auth/youtube.upload"] }); }
export async function exchangeYoutubeCode(code: string) { return (await oauth().getToken(code)).tokens; }
export async function uploadToYouTube(accessToken: string, metadata: { title: string; description: string; tags: string[]; privacyStatus: "private" | "unlisted" | "public"; publishAt?: string }, videoBody: NodeJS.ReadableStream) {
  const client = oauth(); client.setCredentials({ access_token: accessToken });
  return google.youtube("v3").videos.insert({ auth: client, part: ["snippet", "status"], requestBody: { snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags }, status: { privacyStatus: metadata.privacyStatus, publishAt: metadata.publishAt } }, media: { body: videoBody } });
}
