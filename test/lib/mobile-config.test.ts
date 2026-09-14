// Mobile config decides whether the app runs at all, so the failure that
// matters most is a bad config locking every user out. These pin that it can't.
import { compareVersions, DEFAULT_FEATURES, evaluateMobileConfig } from '@/lib/mobile-config';

describe('compareVersions', () => {
  it('orders plain versions segment by segment', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('treats a missing segment as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  it('compares on the release part of a tagged version', () => {
    expect(compareVersions('1.2.0-beta.3', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0+42', '1.1.9')).toBe(1);
  });

  it('never ranks an unparseable version below anything', () => {
    // A typo in the server's minimum must not read as "everyone is outdated".
    expect(compareVersions('0.1.0', 'latest')).toBe(0);
    expect(compareVersions('v1', '2.0.0')).toBe(0);
  });
});

describe('evaluateMobileConfig', () => {
  it('lets the app run when the server has no config', () => {
    expect(evaluateMobileConfig(null, '0.1.0')).toEqual({ gate: { kind: 'ok' }, features: DEFAULT_FEATURES });
    expect(evaluateMobileConfig(undefined, '0.1.0').gate.kind).toBe('ok');
  });

  it('asks for an update below the minimum version', () => {
    const { gate } = evaluateMobileConfig({ minVersion: '0.2.0', updateUrl: 'https://example.com/app', message: 'Please update' }, '0.1.0');
    expect(gate).toEqual({ kind: 'update', minVersion: '0.2.0', updateUrl: 'https://example.com/app', message: 'Please update' });
  });

  it('lets the minimum version itself through', () => {
    expect(evaluateMobileConfig({ minVersion: '0.1.0' }, '0.1.0').gate.kind).toBe('ok');
  });

  it('does not gate when the app cannot report its own version', () => {
    expect(evaluateMobileConfig({ minVersion: '9.0.0' }, null).gate.kind).toBe('ok');
  });

  it('puts the kill switch ahead of the version check', () => {
    const { gate } = evaluateMobileConfig({ killSwitch: true, minVersion: '9.0.0', message: '  Back soon  ' }, '0.1.0');
    expect(gate).toEqual({ kind: 'maintenance', message: 'Back soon' });
  });

  it('only switches a feature off when the server says so explicitly', () => {
    const { features } = evaluateMobileConfig({ features: { paidTrading: false } }, '0.1.0');
    expect(features).toEqual({ ...DEFAULT_FEATURES, paidTrading: false });
  });

  it('ignores a malformed flag rather than switching the feature off', () => {
    const config = { features: { freeTrading: 'no' } } as unknown as Parameters<typeof evaluateMobileConfig>[0];
    expect(evaluateMobileConfig(config, '0.1.0').features.freeTrading).toBe(true);
  });

  it('keeps feature flags alongside a gate, so they are ready when it lifts', () => {
    const { gate, features } = evaluateMobileConfig({ killSwitch: true, features: { onramp: false } }, '0.1.0');
    expect(gate.kind).toBe('maintenance');
    expect(features.onramp).toBe(false);
  });
});
