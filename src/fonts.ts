// Deterministic font loading for render + studio.
// The design system uses Poppins (headings) and Inter (body); loading them
// through @remotion/google-fonts registers the real "Poppins"/"Inter" families
// that lesson-system.css references, and makes Remotion wait for them before
// capturing frames (no FOUT / wrong-metrics flashes in the render).
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

loadPoppins('normal', { weights: ['500', '600', '700'] });
loadInter('normal', { weights: ['400', '500', '600', '700'] });
loadInter('italic', { weights: ['400', '500'] });
