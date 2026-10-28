import { createDiffViewer, createMergeViewer, mergeSamplePhp, type DiffViewer, type MergeViewer } from '@ide-diff/viewer';
import { php } from '@codemirror/lang-php';
import { javascript } from '@codemirror/lang-javascript';
import { samples } from './samples';

const app = document.getElementById('app')!;
const sampleSelect = document.getElementById('sample') as HTMLSelectElement;
const themeSelect = document.getElementById('theme') as HTMLSelectElement;
const titles = document.getElementById('titles') as HTMLInputElement;

const MERGE = 'merge';
samples.forEach((s, i) => sampleSelect.add(new Option(s.name, String(i))));
sampleSelect.add(new Option('Merge – PHP (3-way)', MERGE));

let viewer: DiffViewer | MergeViewer | null = null;
const theme = () => themeSelect.value as 'dark' | 'light';

function mount() {
  viewer?.dispose();
  if (sampleSelect.value === MERGE) {
    const m = mergeSamplePhp;
    viewer = createMergeViewer(app, {
      left: m.left,
      base: m.base,
      right: m.right,
      language: php(),
      leftTitle: titles.checked ? m.leftTitle : undefined,
      baseTitle: titles.checked ? m.baseTitle : undefined,
      rightTitle: titles.checked ? m.rightTitle : undefined,
      theme: theme(),
    });
  } else {
    const s = samples[Number(sampleSelect.value)]!;
    viewer = createDiffViewer(app, {
      original: s.original,
      modified: s.modified,
      language: s.lang === 'php' ? php() : javascript(),
      originalTitle: titles.checked ? s.originalTitle : undefined,
      modifiedTitle: titles.checked ? s.modifiedTitle : undefined,
      theme: theme(),
    });
  }
  (window as unknown as { viewer: unknown }).viewer = viewer;
}

sampleSelect.onchange = mount;
titles.onchange = mount;
themeSelect.onchange = () => {
  document.body.classList.toggle('light', theme() === 'light');
  viewer?.setOptions({ theme: theme() });
};
document.getElementById('dump')!.onclick = () =>
  console.log(viewer && 'getResult' in viewer ? viewer.getResult() : viewer?.getModified());

mount();
