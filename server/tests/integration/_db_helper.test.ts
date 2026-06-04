import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/db.js';
import { resetDb } from '../helpers/db.js';

describe('test db helper', () => {
  beforeEach(resetDb);
  it('starts each test with zero users', async () => {
    expect(await prisma.user.count()).toBe(0);
  });
  it('cleans up between tests', async () => {
    await prisma.user.create({ data: { lineUserId: 'U_test', displayName: 'leftover' } });
    expect(await prisma.user.count()).toBe(1);
  });
  it('confirms previous test was wiped', async () => {
    expect(await prisma.user.count()).toBe(0);
  });
});
