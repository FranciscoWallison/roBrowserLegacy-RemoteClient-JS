import configs from '../config/configs.js';

export default function debugMiddleware(req, res, next) {
  if (configs.DEBUG) {
    console.log(`Request: ${req.method} ${req.url}`);
  }
  next();
}
