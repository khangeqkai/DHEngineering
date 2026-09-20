import { AlertTriangle, Trash2 } from 'lucide-react';

// Ready-made toast icon elements. Toast calls live in plain `.js` hook files
// (the project's naming convention keeps hooks as `use*.js`), and `.js` files
// cannot contain JSX in this build — so the elements are built once here and
// imported wherever a toast needs one, instead of passing an emoji character.
export const warningToastIcon = <AlertTriangle size={16} />;
export const discardToastIcon = <Trash2 size={16} />;
