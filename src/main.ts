import './styles.css';
import { main } from './vs/code/browser/workbench.main';

window.addEventListener('DOMContentLoaded', () => {
  main().catch((err) => {
    console.error('[SideX] Failed to boot:', err);
  });
});
