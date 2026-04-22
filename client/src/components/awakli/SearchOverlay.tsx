import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { Search, X, Film, ArrowRight, Loader2 } from "lucide-react";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const searchResults = trpc.search.projects.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const results = (searchResults.data ?? []) as Array<any>;

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      const item = results[selectedIndex];
      if (item.slug) {
        window.location.href = `/watch/${item.slug}`;
        onClose();
      }
    }
  }, [results, selectedIndex, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-bg-void/90 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-2xl mx-auto mt-[15vh] px-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search projects, genres, creators..."
                className="w-full pl-14 pr-14 py-5 bg-surface-1/80 border border-white/10 rounded-2xl text-lg text-white placeholder-gray-500 focus:outline-none focus:border-token-violet/50"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            {/* Results */}
            {debouncedQuery.length >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-2xl border border-white/10 bg-surface-1/80 backdrop-blur-sm overflow-hidden max-h-[50vh] overflow-y-auto"
              >
                {searchResults.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-token-violet animate-spin" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-400">No results for "{debouncedQuery}"</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {results.map((item: any, i: number) => (
                      <Link key={item.id} href={item.slug ? `/watch/${item.slug}` : "#"}>
                        <div
                          onClick={onClose}
                          className={`flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors ${
                            i === selectedIndex ? "bg-token-violet/10" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden bg-surface-2 flex-shrink-0">
                            {item.coverImageUrl ? (
                              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-token-violet/20 to-token-lavender/20 flex items-center justify-center">
                                <Film className="w-4 h-4 text-gray-600" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{item.title}</p>
                            <p className="text-xs text-gray-400">{item.genre?.split(",")[0] || "Project"} · by {item.userName || "Anonymous"}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Keyboard hints */}
            <div className="flex items-center justify-center gap-6 mt-6 text-xs text-gray-500">
              <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-mono">↑↓</kbd> Navigate</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-mono">Enter</kbd> Open</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-mono">Esc</kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
