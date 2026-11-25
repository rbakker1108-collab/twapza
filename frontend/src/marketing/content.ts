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
  slug: string; // /solutions/<slug>
  guide: string; // the guide slug linked from its page
  icon: string;
  title: string;
  text: string;
  points: string[];
}

export const AUDIENCES: Audience[] = [
  {
    icon: "mic",
    slug: "podcasters",
    guide: "podcast-to-shorts",
    title: msg("Podcasters"),
    text: msg("Turn every episode into a week of Shorts. Twapza finds the quotes, stories and hot takes that make people want the full episode."),
    points: [msg("Episodes of up to 3 hours"), msg("Captions that follow every speaker"), msg("A credit and link to the full episode in every description")],
  },
  {
    icon: "video",
    slug: "youtubers",
    guide: "repurpose-for-tiktok-and-reels",
    title: msg("YouTubers"),
    text: msg("Give your long videos a second life on Shorts, the fastest way to reach new viewers and bring them to your channel."),
    points: [msg("Paste your video link, no download needed"), msg("Hooks and titles written for the Shorts feed"), msg("Clips that end on a loop-friendly line")],
  },
  {
    icon: "school",
    slug: "coaches-and-educators",
    guide: "moments-that-make-great-shorts",
    title: msg("Coaches and educators"),
    text: msg("Share your best tips and lessons as bite-sized clips that bring people to your courses, webinars and programs."),
    points: [msg("“Look for” lets AI find the tips you want"), msg("Clear captions for people watching without sound"), msg("Your own texts for calls to action")],
  },
  {
    icon: "game",
    slug: "streamers",
    guide: "length",
    title: msg("Streamers"),
    text: msg("Your stream's funniest and most intense moments, clipped and captioned while you sleep."),
    points: [msg("Finds peaks with audio energy and scene changes"), msg("Simple clips for whole-stream highlights"), msg("Progress bar and fast pacing built in")],
  },
  {
    icon: "team",
    slug: "agencies",
    guide: "captions",
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
    a: msg("Up to 1 hour on Free, 2 hours on Creator and 3 hours on Pro, which covers most podcasts, streams, interviews and webinars."),
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
  {
    slug: "podcast-to-shorts",
    title: msg("How to turn a podcast into YouTube Shorts"),
    summary: msg("Your podcast is full of great clips. Here is how to find them and make them work on Shorts."),
    minutes: 3,
    body: [
      msg("A one-hour podcast episode easily holds ten or more moments that work on their own: a strong opinion, a funny story, a surprising fact or a clear piece of advice."),
      msg("Look for moments that need no context. A good clip starts with a line that makes sense to someone who has never heard your show. Twapza's AI highlights read the whole transcript and look for exactly these standalone moments."),
      msg("Go vertical without cutting anyone off. Podcasts often have two or more people on screen. Fit the whole frame on a blurred background so everyone stays visible, or use the centre crop when there is one speaker."),
      msg("Captions are a must, because most people scroll without sound. Use big, word-by-word captions and put a short hook on screen in the first seconds."),
      msg("Post regularly. The clips from one episode can fill a week of Shorts, and each one is a way for new listeners to find the full episode."),
    ],
  },
  {
    slug: "repurpose-for-tiktok-and-reels",
    title: msg("How to repurpose YouTube videos for TikTok and Reels"),
    summary: msg("One long video can feed every short-video platform. Here is how to adapt it."),
    minutes: 3,
    body: [
      msg("TikTok, Instagram Reels and YouTube Shorts all use the same vertical 9:16 format, so one clip can work on all three."),
      msg("Start with your own long videos. Only use videos you made or have permission to use, and credit the original creator when you clip someone else's video with their permission."),
      msg("Pick the strongest moments, not the first minutes. A long video usually opens with an introduction, while short-video viewers want the point straight away."),
      msg("Write the text for each clip. A short hook description and a few relevant hashtags help people find it. Twapza writes a description, title ideas and hashtags for every clip."),
      msg("Download once, post everywhere. Twapza gives you a 1080×1920 video with the captions burned in, plus an SRT subtitle file for platforms that let you upload captions separately."),
    ],
  },
  {
    slug: "add-subtitles-to-shorts",
    title: msg("How to add subtitles to YouTube Shorts"),
    summary: msg("Burned-in captions or an SRT file? Two ways to add subtitles to your Shorts, and when to use which."),
    minutes: 2,
    body: [
      msg("There are two kinds of subtitles: captions burned into the video, and a separate subtitle file (SRT) that viewers can switch on or off."),
      msg("Burned-in captions work everywhere and catch the eye. On Shorts, TikTok and Reels they are the norm, because they show even when the sound is off and nobody has to switch them on."),
      msg("A subtitle file helps viewers who rely on captions. Upload the SRT file in YouTube Studio under Subtitles, and viewers can switch the subtitles on or off."),
      msg("Twapza does both: it transcribes your video automatically, burns in animated word-by-word captions, and lets you download the matching SRT file for each clip."),
      msg("Check names and terms. Speech recognition sometimes mishears names or jargon. Fix a word once in the editor and it is fixed in every clip of that video."),
    ],
  },
  {
    slug: "moments-that-make-great-shorts",
    title: msg("7 moments that make great Shorts"),
    summary: msg("Strong opinions, stories, tips and more: the moments to look for when you clip a long video."),
    minutes: 3,
    body: [
      msg("Not every good minute of a long video makes a good Short. These are the moments that tend to work on their own."),
      msg("1. A strong opinion. A clear, slightly bold statement makes people want to agree or argue in the comments."),
      msg("2. A story with a twist. A short story with a surprising ending keeps viewers watching until the last second."),
      msg("3. A useful tip. One clear piece of advice that viewers can use straight away is worth saving and sharing."),
      msg("4. A surprising fact or number. Something viewers didn't know makes them stop scrolling."),
      msg("5. A funny moment. Laughter is easy to share and works for almost any audience."),
      msg("6. An honest, personal moment. Real emotion builds a connection with your audience."),
      msg("7. A question to the viewer. Ending on a question invites comments and can make the clip loop."),
      msg("Tip: in Twapza, use “Look for” to ask the AI for a specific kind of moment, like funny stories or practical tips."),
    ],
  },
];

/**
 * Comparison pages (/compare/<slug>). Only state facts about other tools that their own website and
 * several reviews agree on, say where they are stronger, and leave out their prices (they change
 * often). COMPARISONS_CHECKED is shown on the page; re-check the facts when you update it.
 */
export const COMPARISONS_CHECKED = "2026-11-24";

export interface ComparisonRow {
  label: string;
  twapza: string;
  them: string;
}

export interface Comparison {
  slug: string;
  name: string; // a product name, not translated
  site: string;
  intro: string;
  rows: ComparisonRow[];
  chooseThem: string[];
}

const FREE_ROW = msg("Free plan");
const PAY_ROW = msg("How you pay");
const REFRAME_ROW = msg("Frame follows the speaker");
const SCHEDULE_ROW = msg("Schedule posts from the app");
const TWAPZA = {
  free: msg("Yes: 60 minutes a month, with a small watermark"),
  pay: msg("Minutes of video per month, monthly or yearly"),
  reframe: msg("Not yet: whole frame on a blurred background, black bars or centre crop"),
  schedule: msg("No: you download the clips and post them yourself"),
};
const CREDITS = msg("Credits, based on minutes of video");
const FREE_WATERMARK = msg("Yes, with a watermark");
const BUILT_IN = msg("Yes, built in");

export const COMPARISONS: Comparison[] = [
  {
    slug: "opusclip",
    name: "OpusClip",
    site: "https://www.opus.pro",
    intro: msg("OpusClip is one of the best-known AI clipping tools. Like Twapza, it turns a long video into short vertical clips: it picks the best moments, adds animated captions and gives each clip a score. The differences are in the extras, the pricing and the languages."),
    rows: [
      { label: FREE_ROW, twapza: TWAPZA.free, them: FREE_WATERMARK },
      { label: PAY_ROW, twapza: TWAPZA.pay, them: CREDITS },
      { label: REFRAME_ROW, twapza: TWAPZA.reframe, them: msg("Yes (AI reframe)") },
      { label: SCHEDULE_ROW, twapza: TWAPZA.schedule, them: BUILT_IN },
    ],
    chooseThem: [
      msg("You want the frame to follow the speaker automatically."),
      msg("You want to schedule posts to your social accounts from the same tool."),
      msg("You work in a team that shares credits and brand templates."),
    ],
  },
  {
    slug: "vizard",
    name: "Vizard",
    site: "https://vizard.ai",
    intro: msg("Vizard is an AI video editor that cuts long videos into short clips, with captions, speaker focus and a content calendar. Twapza does the core job the same way, and focuses on simple pricing, six interface languages and ready-to-post text that credits the original creator."),
    rows: [
      { label: FREE_ROW, twapza: TWAPZA.free, them: FREE_WATERMARK },
      { label: PAY_ROW, twapza: TWAPZA.pay, them: CREDITS },
      { label: REFRAME_ROW, twapza: TWAPZA.reframe, them: msg("Yes (auto speaker focus)") },
      { label: SCHEDULE_ROW, twapza: TWAPZA.schedule, them: BUILT_IN },
    ],
    chooseThem: [
      msg("You want the frame to follow the speaker automatically."),
      msg("You want a content calendar to schedule posts from the same tool."),
    ],
  },
  {
    slug: "klap",
    name: "Klap",
    site: "https://klap.app",
    intro: msg("Klap turns long videos into short clips with AI and charges by the number of clips it makes. Twapza charges by the minutes of video you add, has a free plan to start with, and adds an editor for hooks, captions and your own texts."),
    rows: [
      { label: FREE_ROW, twapza: TWAPZA.free, them: msg("A free try on one video; downloading needs a paid plan") },
      { label: PAY_ROW, twapza: TWAPZA.pay, them: msg("Number of clips per month") },
      { label: SCHEDULE_ROW, twapza: TWAPZA.schedule, them: BUILT_IN },
    ],
    chooseThem: [
      msg("You prefer paying per clip instead of per minute of video."),
      msg("You want to schedule and post clips from the same tool."),
    ],
  },
];

/** Where Twapza stands out (true for every comparison). */
export const TWAPZA_STRENGTHS = [
  msg("The whole app in six languages, and captions in dozens, including Arabic written right to left."),
  msg("Simple pricing in minutes of video, with a free plan to start."),
  msg("Descriptions that credit the original creator automatically."),
  msg("An editor for hook text, cold opens, your own texts and caption fixes, with pause and filler-word removal."),
  msg("Private by default: your videos are deleted automatically after 24 hours."),
];

export const CHOOSE_TWAPZA = [
  msg("You want the app and captions in your own language, including Arabic."),
  msg("You want simple pricing per minute of video, with a free plan to start."),
  msg("You want clips with hooks, captions and a description, ready to post, without learning a video editor."),
];

export interface Tool {
  slug: string; // /tools/<slug>
  name: string; // menu label
  heading: string;
  intro: string;
  points: { title: string; text: string }[];
}

/** One page per job people search for. Only describe what Twapza really does. */
export const TOOLS: Tool[] = [
  {
    slug: "youtube-shorts-maker",
    name: msg("YouTube Shorts maker"),
    heading: msg("Make YouTube Shorts from your long videos"),
    intro: msg("Paste a link to a video you posted and Twapza turns it into vertical Shorts: the best moments, animated captions and a hook, ready to upload."),
    points: [
      { title: msg("Finds the best moments"), text: msg("AI reads the whole transcript and ranks the moments most likely to keep people watching.") },
      { title: msg("Vertical without losing the picture"), text: msg("Every clip is 1080×1920. Keep the whole frame on a blurred background, use black bars or crop the centre.") },
      { title: msg("Ready to post"), text: msg("Captions, a hook on screen, and a title, description and hashtags for each Short.") },
    ],
  },
  {
    slug: "podcast-clip-generator",
    name: msg("Podcast clip generator"),
    heading: msg("Turn podcast episodes into short clips with AI"),
    intro: msg("Add an episode of up to 3 hours and get the quotes, stories and hot takes that work on their own, captioned and ready for Shorts, TikTok and Reels."),
    points: [
      { title: msg("Moments that stand on their own"), text: msg("AI looks for moments that make sense without the rest of the episode.") },
      { title: msg("Everyone stays in the picture"), text: msg("Fit two or more speakers into a vertical frame on a blurred background.") },
      { title: msg("A link to the full episode"), text: msg("Every description can credit and link the full episode, so new listeners find it.") },
    ],
  },
  {
    slug: "auto-subtitle-generator",
    name: msg("Auto subtitle generator"),
    heading: msg("Automatic subtitles for your Shorts"),
    intro: msg("Twapza transcribes your video automatically and adds animated word-by-word captions in dozens of languages. Download the clip with captions burned in, or the SRT file."),
    points: [
      { title: msg("Word-by-word captions"), text: msg("The spoken word lights up as it is said, in bold fonts and your own colours.") },
      { title: msg("Dozens of languages"), text: msg("The spoken language is recognised automatically, including Spanish, German, French, Dutch and Arabic, written right to left.") },
      { title: msg("SRT file included"), text: msg("Download a subtitle file for each clip, for platforms that accept one, like YouTube.") },
    ],
  },
  {
    slug: "youtube-clip-maker",
    name: msg("YouTube clip maker"),
    heading: msg("Cut clips from your YouTube videos"),
    intro: msg("Let AI find the highlights or split the whole video into clips. Trim each clip to the second, fix the captions and download it in 1080p."),
    points: [
      { title: msg("AI or simple clips"), text: msg("Let AI find the highlights, or split the whole video into clips of a fixed length that end on full sentences.") },
      { title: msg("Trim to the second"), text: msg("Move the start and end of any clip; cuts land between words, never in the middle of one.") },
      { title: msg("Vertical or original"), text: msg("Download vertical 9:16 for Shorts, or keep the original shape of your video.") },
    ],
  },
  {
    slug: "tiktok-and-reels-clips",
    name: msg("TikTok and Reels clips"),
    heading: msg("Turn YouTube videos into TikToks and Reels"),
    intro: msg("One long video, clips for every platform. Twapza makes vertical videos with captions and hooks that work on TikTok, Instagram Reels and YouTube Shorts alike."),
    points: [
      { title: msg("One format for all"), text: msg("1080×1920 vertical video, the format TikTok, Reels and Shorts all use.") },
      { title: msg("Hooks that stop the scroll"), text: msg("Bold hook text, a cold open and cut pauses keep viewers watching.") },
      { title: msg("Text for every post"), text: msg("AI writes a description, title ideas and hashtags you can paste into any app.") },
    ],
  },
];
