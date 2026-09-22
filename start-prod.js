// Production launcher. NODE_ENV has to be set before index.js loads -- the logger and configs read it
// as they are imported -- so index.js is imported dynamically, after the assignment. A static import
// would be hoisted above it. An explicit NODE_ENV in .env does not override this: variables already set
// in the environment win over the file.
process.env.NODE_ENV = 'production';
await import('./index.js');
