import { Lesson, Overlay } from '../LessonVideo';

export const mergeLessonWithOverrides = (
  lesson: Lesson,
  overrides: { overlays?: Overlay[] }
): Lesson => ({
  ...lesson,
  overlays: overrides.overlays ?? [],
});
