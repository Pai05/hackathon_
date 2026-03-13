import { SearchBar } from '@/components/SearchBar';
import { PapersPanel } from '@/components/PapersPanel';
import { SynthesisPanel } from '@/components/SynthesisPanel';
import { PipelineStatus } from '@/components/PipelineStatus';
import { useResearch } from '@/hooks/use-research';
import { useAuth } from '@/lib/auth-context';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { query, result, isLoading, error, startResearch, generateSynthesis } = useResearch();
  const { user, logout } = useAuth();

  const hasResults = result?.status === 'completed' && result.papers?.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-bold font-heading text-foreground">ResearchHub</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>{user?.name || user?.email}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-foreground gap-1.5">
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>
        </div>
      </div>

      {/* Search state */}
      {!hasResults && !isLoading && (
        <div className="flex items-center justify-center min-h-screen px-6 pt-14">
          <SearchBar onSearch={startResearch} isLoading={isLoading} />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-14">
          <SearchBar onSearch={startResearch} isLoading={isLoading} />
          <PipelineStatus status={result?.status || 'running'} />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-14">
          <SearchBar onSearch={startResearch} isLoading={false} />
          <div className="mt-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive max-w-md text-center">
            {error}. Please check your backend is running and try again.
          </div>
        </div>
      )}

      {/* Results: split layout */}
      {hasResults && (
        <div className="flex h-screen pt-14">
          <div className="w-[30%] border-r border-border bg-card overflow-hidden flex flex-col">
            <PapersPanel papers={result.papers} query={query} />
          </div>
          <div className="w-[70%] bg-background overflow-hidden flex flex-col">
            <SynthesisPanel result={result} onGenerateSynthesis={generateSynthesis} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
