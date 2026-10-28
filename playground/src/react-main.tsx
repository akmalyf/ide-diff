import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiffEditor, MergeEditor, type MergeStatus } from '@ide-diff/react';
import { mergeSamplePhp } from '@ide-diff/viewer';
import { php } from '@codemirror/lang-php';
import { samples } from './samples';

const phpLang = php();

function App() {
  const [view, setView] = useState<'diff' | 'merge'>('diff');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mode, setMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const sample = samples[0]!;
  const [modified, setModified] = useState(sample.modified);
  const [status, setStatus] = useState<MergeStatus | null>(null);
  const lines = useMemo(() => modified.split('\n').length, [modified]);

  document.body.classList.toggle('light', theme === 'light');

  return (
    <>
      <header className="controls">
        <strong>ide-diff · React</strong>
        <label>
          View{' '}
          <select value={view} onChange={(e) => setView(e.target.value as 'diff' | 'merge')}>
            <option value="diff">&lt;DiffEditor&gt;</option>
            <option value="merge">&lt;MergeEditor&gt;</option>
          </select>
        </label>
        <label>
          Theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}>
            <option value="dark">Islands Dark</option>
            <option value="light">Islands Light</option>
          </select>
        </label>
        {view === 'diff' ? (
          <>
            <label>
              Mode{' '}
              <select value={mode} onChange={(e) => setMode(e.target.value as 'side-by-side' | 'unified')}>
                <option value="side-by-side">side-by-side</option>
                <option value="unified">unified</option>
              </select>
            </label>
            <button onClick={() => setModified(sample.modified)}>Reset modified</button>
            <span>modified: {lines} lines (controlled state)</span>
          </>
        ) : (
          <span>{status ? `${status.changes} changes, ${status.conflicts} conflicts` : ''}</span>
        )}
        <a href="/">vanilla demo →</a>
      </header>
      <main id="app">
        {view === 'diff' ? (
          <DiffEditor
            original={sample.original}
            modified={modified}
            onChange={setModified}
            language={phpLang}
            originalTitle={sample.originalTitle}
            modifiedTitle={sample.modifiedTitle}
            theme={theme}
            mode={mode}
          />
        ) : (
          <MergeEditor
            left={mergeSamplePhp.left}
            base={mergeSamplePhp.base}
            right={mergeSamplePhp.right}
            leftTitle={mergeSamplePhp.leftTitle}
            baseTitle={mergeSamplePhp.baseTitle}
            rightTitle={mergeSamplePhp.rightTitle}
            language={phpLang}
            theme={theme}
            onStatusChange={setStatus}
          />
        )}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
