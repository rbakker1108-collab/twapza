import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { looksLikeYoutubeLink } from "../components/YoutubeImportForm";
import { useT } from "../i18n";
import { savePendingLink } from "../lib/pendingLink";
import { Link } from "./links";

/** "Paste a YouTube link → Get clips": remembers the link and takes the visitor to sign-up (or
 *  straight to the app when logged in), where it is waiting in the import form. */
export function HeroLinkBox() {
  const t = useT();
  const navigate = useNavigate();
  const { account } = useAuth();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!looksLikeYoutubeLink(url)) {
      setError(t("Paste a YouTube video link, like https://www.youtube.com/watch?v=… or https://youtu.be/…."));
      return;
    }
    savePendingLink(url.trim());
    navigate(account ? "/app" : "/signup");
  }

  return (
    <div className="mx-auto max-w-xl lg:mx-0">
      <form onSubmit={submit} className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface p-2 shadow-2xl shadow-black/40 sm:flex-row">
        <label htmlFor="hero-link" className="sr-only">
          {t("YouTube link")}
        </label>
        <input
          id="hero-link"
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder={t("Paste a YouTube link")}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-3 text-ink placeholder:text-faint focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-brand-500 px-5 py-3 font-semibold text-black transition hover:bg-brand-400">
          {t("Get clips for free")}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm text-muted">
        <Link to={account ? "/app" : "/signup"} className="font-medium text-brand-400 hover:underline">
          {t("Or upload a file")}
        </Link>
        {" · "}
        <Link to="/how-it-works" className="hover:text-ink">
          {t("See how it works")}
        </Link>
      </p>
    </div>
  );
}
