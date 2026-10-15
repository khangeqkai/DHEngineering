// Lets `node --test` load the client's source files as they are written for Vite:
// extensionless relative imports, ES-module syntax in plain .js files, and the shared
// CommonJS rule files under server/src/shared. No dependencies.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
