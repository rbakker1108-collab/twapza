/** Website copy shared by several pages. English, translated with t() where shown. */
import { msg } from "../i18n";

export interface Item {
  icon: string;
  title: string;
  text: string;
}

export const STEPS: Item[] = [
  { icon: "upload", title: msg("Paste a link or upload"), text: msg("Add a YouTube video you posted, or upload an mp4, mov or mkv of up to 3 hours.") },
  { icon: "spark", title: msg("AI finds the best moments"), text: msg("Claude reads the whole transcript and picks the moments with the strongest hooks, ranked by a virality score.") },
  { icon: "edit", title: msg("Edit in seconds"), text: msg("Add a hook, drag your own texts onto the video and fix captions, with a live preview.") },
  { icon: "download", title: msg("Download and post"), text: msg("Get a vertical 1080×1920 video plus a title, description and hashtags, ready for Shorts, TikTok and Reels.") },
];

export const FEATURES: Item[] = [
  { icon: "spark", title: msg("AI highlights"), text: msg("The strongest standalone moments from your video, with a virality score, a title and the hook that opens each one.") },
  { icon: "captions", title: msg("Animated captions"), text: msg("Word-by-word captions in four bold fonts and your own colours. Many people watch Shorts with the sound off.") },
  { icon: "hook", title: msg("Hook text and cold open"), text: msg("A bold title on the first seconds, and an optional teaser of the most gripping line to stop the scroll.") },
  { icon: "edit", title: msg("Drag-and-drop editor"), text: msg("Place your own texts anywhere, pick fonts and timing, and see exactly what you'll download.") },
  { icon: "scissors", title: msg("Cut pauses and filler words"), text: msg("Remove silences and “um”s automatically for the fast pace that keeps viewers watching.") },
  { icon: "text", title: msg("Titles, descriptions and hashtags"), text: msg("AI writes a description that gets clicks, with title ideas and hashtags, and credits the original creator.") },
  { icon: "globe", title: msg("Any language"), text: msg("Captions for videos in dozens of languages, Arabic included, and the app in six languages.") },
  { icon: "lock", title: msg("Private by default"), text: msg("Your original video is never changed, and everything is deleted automatically after 24 hours.") },
];

export interface Audience {
  icon: string;
  title: string;
  text: string;
  points: string[];
}

export const AUDIENCES: Audience[] = [
  {
    icon: "mic",
    title: msg("Podcasters"),
    text: msg("Turn every episode into a week of Shorts. Twapza finds the quotes, stories and hot takes that make people want the full episode."),
    points: [msg("Episodes of up to 3 hours"), msg("Captions that follow every speaker"), msg("A credit and link to the full episode in every description")],
  },
  {
    icon: "video",
    title: msg("YouTubers"),
    text: msg("Give your long videos a second life on Shorts, the fastest way to reach new viewers and bring them to your channel."),
    points: [msg("Paste your video link, no download needed"), msg("Hooks and titles written for the Shorts feed"), msg("Clips that end on a loop-friendly line")],
  },
  {
    icon: "school",
    title: msg("Coaches and educators"),
    text: msg("Share your best tips and lessons as bite-sized clips that bring people to your courses, webinars and programs."),
    points: [msg("“Look for” lets AI find the tips you want"), msg("Clear captions for people watching without sound"), msg("Your own texts for calls to action")],
  },
  {
    icon: "game",
    title: msg("Streamers"),
    text: msg("Your stream's funniest and most intense moments, clipped and captioned while you sleep."),
    points: [msg("Finds peaks with audio energy and scene changes"), msg("Simple clips for whole-stream highlights"), msg("Progress bar and fast pacing built in")],
  },
  {
    icon: "team",
    title: msg("Clippers and agencies"),
    text: msg("Produce more clips for the creators you work with, in their language, with the right credit every time."),
    points: [msg("Captions and app in six languages"), msg("Download all clips of a video at once"), msg("Only for videos you have permission to use")],
  },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: msg("Do I need editing skills?"),
    a: msg("No. Paste a link or upload a file, and Twapza finds the clips, adds captions and gives you a finished vertical video. The editor is there when you want to change something."),
  },
  {
    q: msg("Which languages does Twapza support?"),
    a: msg("Twapza transcribes and captions videos in dozens of languages, including English, Spanish, Dutch, German, French and Arabic. The app itself is available in six languages."),
  },
  {
    q: msg("Can I use videos from other creators?"),
    a: msg("Only if you own the video or have permission to use it. Twapza asks you to confirm this for every video, and credits the original creator in your descriptions."),
  },
  {
    q: msg("What happens to my videos?"),
    a: msg("Your uploads and clips are deleted automatically after 24 hours, and your original file is never changed."),
  },
  {
    q: msg("How long can my videos be?"),
    a: msg("Up to 3 hours, which covers most podcasts, streams, interviews and webinars."),
  },
];

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  body: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: "hooks",
    title: msg("How to write a hook that stops the scroll"),
    summary: msg("Viewers decide in the first second or two. Here is how to win that moment."),
    minutes: 3,
    body: [
      msg("On Shorts, people decide almost instantly whether to keep watching. Your first line has one job: make them curious about what comes next."),
      msg("Start in the middle of the action. Skip greetings and introductions, and open with the most surprising sentence of the clip. Twapza's cold open does this for you by playing the most gripping line first."),
      msg("Make a promise. A hook like “This one mistake cost me $10,000” tells viewers exactly what they will get if they stay."),
      msg("Show it, too. Many people watch without sound, so put your hook on screen as text for the first seconds. Keep it under seven words."),
      msg("Test two openings. Post the same clip with different hooks and compare how many viewers swipe away in YouTube Studio."),
    ],
  },
  {
    slug: "length",
    title: msg("The best length for YouTube Shorts"),
    summary: msg("Shorter is not always better. What matters is how much of the clip people watch."),
    minutes: 2,
    body: [
      msg("Shorts can be up to three minutes, but many viral Shorts are much shorter. What the algorithm rewards is not length, but how much of your Short people watch, and whether they watch it again."),
      msg("For most talking clips, 20 to 45 seconds is the sweet spot: long enough for a complete thought, short enough that most viewers reach the end."),
      msg("End on a line that leads back to the start, like a question or a punchline, and your Short will loop naturally. Twapza's “Short & loopable” option looks for exactly these moments."),
      msg("Cut what slows you down. Removing pauses and filler words can make the same clip several seconds shorter without losing anything."),
    ],
  },
  {
    slug: "captions",
    title: msg("Captions that keep viewers watching"),
    summary: msg("Many people scroll with the sound off. Good captions turn them into viewers."),
    minutes: 2,
    body: [
      msg("Captions make your Short understandable without sound, and moving captions give the eye something to follow. Both help people keep watching."),
      msg("Show a few words at a time and highlight the word being spoken. Three or four words per line is easy to read on a phone."),
      msg("Keep captions away from the edges of the screen, where YouTube's buttons and title cover the video. Just below the middle works well."),
      msg("Check the spelling of names and brands. A wrong word is distracting, so fix it before you download. In Twapza's editor this takes seconds."),
    ],
  },
];
