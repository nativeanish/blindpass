"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
export function SearchForm({
  onSearch,
  busy = false,
  initial = "",
}: {
  onSearch?: (query: string) => void;
  busy?: boolean;
  initial?: string;
}) {
  const [query, setQuery] = useState(initial);
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim()) {
          if (onSearch) onSearch(query.trim());
          else router.push(`/app/search?q=${encodeURIComponent(query.trim())}`);
        }
      }}
    >
      <div className="search-input-row">
        <Search size={17} />
        <label className="sr-only" htmlFor="private-query">
          Search query
        </label>
        <input
          id="private-query"
          autoComplete="off"
          maxLength={240}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the open web’s technical knowledge…"
        />
        <button
          className="button button-small"
          disabled={busy || !query.trim()}
          type="submit"
        >
          <span>{busy ? "Searching…" : "Search privately"}</span>
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="search-hints">
        {["Privacy Pass", "Zcash Orchard", "oblivious HTTP", "TLS"].map(
          (hint) => (
            <button
              type="button"
              className="chip"
              key={hint}
              onClick={() => setQuery(hint)}
            >
              {hint}
            </button>
          ),
        )}
      </div>
    </form>
  );
}
