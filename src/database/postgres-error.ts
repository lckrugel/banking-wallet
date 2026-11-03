export function isPostgresConstraintViolation(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      'code' in current &&
      current.code === code &&
      'constraint' in current &&
      current.constraint === constraint
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : undefined;
  }

  return false;
}
