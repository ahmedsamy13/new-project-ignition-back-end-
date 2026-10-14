// Callers pass only explicitly selected metadata, never request or error objects.
export function writeLog(level, event, metadata = {}) {
  const entry = JSON.stringify({ time: new Date().toISOString(), level, event, ...metadata });
  if (level === 'error') console.error(entry);
  else console.log(entry);
}
