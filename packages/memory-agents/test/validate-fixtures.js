'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  PREDEFINED_AGENTS,
  agentWorkspaceFiles,
  getAgent,
  getAgentIds,
  getRoleBundle,
  roleManifest,
  rosterManifest,
} = require('..');

const EXPECTED_HASHES = {
  nyx: {
    'AGENTS.md': '405115f46db973b7cb11b9834cc6431313dd8bbf9932335cfb5823e3c8ca0c34',
    'SOUL.md': '6abbc76df7c25d4436cd0d987cb66dea0104cd6308d79521109c015692e37cde',
    'USER.md': 'b18165386e168bdd1387e7fbb591ea6596e81e8c888414047096e25c8439c465',
    'IDENTITY.md': '8901e859b3cf94767c145302ebe1c4b88e8417d597f8d6abcb939f53f5ddac22',
    'TOOLS.md': 'a194e78840ae4b27d4a72bc238c5f886449fc7b362a15a2e866c5738199c9c02',
    'HEARTBEAT.md': '8e89d17c8bb05d5240c92d3f45a546c72b25cb2b6a767aff93e46555bb31ebca',
    'BOOTSTRAP.md': '2bdf27f29636fb6d60e95758afa2219bae9e1d75e37a6fda7e080535c74c285a',
    'BOOT.md': '2f2154b0af431f86ecda2e632e8bd8892f67950c6cfb91ef7b7df53d75b61abf',
    'MEMORY.md': 'b9936da6c6ad61427b5c77b5c92e50757b66c76f983a4eaaa62817a80d513168',
    'memory/2026-01-15.md': '2d010f7777be8a82a0c0768329fd7fd726cf200d83fb5bd91a4795299eabb364',
  },
  medea: {
    'AGENTS.md': '26634fe7f9fc7b10cf79f9a3cd879e13c59af1bdb50072c0e465d14468e10d3e',
    'SOUL.md': 'ac358c7e56b324db6b4e96288f01613f0761d51c7699728d1c356ae7d0b4e520',
    'USER.md': '8d9e2dd051c2f1a719eaa5b730f3b091cb5a784453aeedbe77fda25c1c8ebf6e',
    'IDENTITY.md': '86304be2cfb5b19cb5f35ee4828a8bf18e2c4be07d3b80b086c47624d35a36ff',
    'TOOLS.md': 'd306add82c73f113f3b73ba99464f7931dc4a550848d042b8957e8c660eeef54',
    'HEARTBEAT.md': '8e89d17c8bb05d5240c92d3f45a546c72b25cb2b6a767aff93e46555bb31ebca',
    'BOOTSTRAP.md': '493759c44a9b591d36e7854f694bc029f45f9b030ea9ae2f6b4ea764f1b078c6',
    'BOOT.md': 'b57c50bea9de2666d23f440a44b3d87e48efbe624620ef9bd3c6c4e77c023553',
    'MEMORY.md': 'e8834e815febc542308b2007e0cf197e421d2150fbc909fe1a820ebc922606e3',
    'memory/2026-01-15.md': '5b3aede42190914ad309930c20368621e43c2a48a5ede2e8eb0ca4f0560d4fe3',
  },
  arx: {
    'AGENTS.md': '41c6c1bd4070438a63409b9bf070186d3ad099b1ed1d55fa519b061f7caa0dad',
    'SOUL.md': 'b818b2d21cdd7139ac44832d41b2437ed31dec22949570d2b900d40ae53b3df4',
    'USER.md': '8d9e2dd051c2f1a719eaa5b730f3b091cb5a784453aeedbe77fda25c1c8ebf6e',
    'IDENTITY.md': 'd82aa920ae87cfec342fff8621051b1714934bfd17e79d31e874e9a07328b6f8',
    'TOOLS.md': '86eac981d7179cc673816e83a3976f672b47b988f48a487e15c38e213d39864a',
    'HEARTBEAT.md': '8e89d17c8bb05d5240c92d3f45a546c72b25cb2b6a767aff93e46555bb31ebca',
    'BOOTSTRAP.md': '92aee55c81b2588b8cd61c9a90643314b627c2eb220490bdd93ac1a14af2efab',
    'BOOT.md': '2cc8a6bda4815825940e9db54c8927bfa349834f3fb6748bdec07fed878d22b0',
    'MEMORY.md': 'eda759076b8f2d2329573e48f01101b606977aded67019ecddc6191c7c7bc7cd',
    'memory/2026-01-15.md': '0c8d68178c29f04c80ff0be46a88569c05b0a84d5d4e15c340bc87f858350623',
  },
  lev: {
    'AGENTS.md': '43ef5b6f57f976c7dcb001229bf4138c338e5b26bfcdfc7bf72505551e560282',
    'SOUL.md': '293a4c31a4543aadeeb0f26fac673dc81a11d52b7bf01e3d3850bedfc8f647fc',
    'USER.md': '8d9e2dd051c2f1a719eaa5b730f3b091cb5a784453aeedbe77fda25c1c8ebf6e',
    'IDENTITY.md': 'b44c416f8d6fac8b2ba873066cb1325e8a4c68bf02c4a4270c276deba664e4ef',
    'TOOLS.md': '3ee87b5cffa0e0cdea6a9ee11c512fc311d8216b8e13413f672870b417cd8287',
    'HEARTBEAT.md': '852e4933687c6082b8e8b7916f495021900a0285e1fbab356cee81c7196af297',
    'BOOTSTRAP.md': '7b28861420a6b20628d41e31faf0ab430a46ae43cfb098e341a4e9b1726c376f',
    'BOOT.md': '72c40d94b91689c8191d5ad2d135213cf442b72433f4f959428bf2c49a511f2e',
    'MEMORY.md': '82fcc51903b1eb4add778fb2416e66babdf4840fec637752ae8bbcb2a2f67757',
    'memory/2026-01-15.md': 'ccf09ae315e0213f6e1827a37db82fde3a4daef48c9e9f01139a34be3e67da3e',
  },
  mnemo: {
    'AGENTS.md': 'ed79b2d5ad501db63d12be2274728b1156d7eebe0d6dc7bbc3f58287498f3c1b',
    'SOUL.md': '230f7aae7aeb7af110730e6e267abdb68b6a0e4ef28f4599201af25e781ba9e9',
    'USER.md': '8d9e2dd051c2f1a719eaa5b730f3b091cb5a784453aeedbe77fda25c1c8ebf6e',
    'IDENTITY.md': 'ab1d76b53f4bfa5a1916193f35a7328eeec8dc568d8150660ce1c4b0f842f51f',
    'TOOLS.md': '66d89674ae69d647dd5859c92682f506f162d3a7a648be91bf65dfd015e39e19',
    'HEARTBEAT.md': '8e89d17c8bb05d5240c92d3f45a546c72b25cb2b6a767aff93e46555bb31ebca',
    'BOOTSTRAP.md': '2c3300e638d237d6e54790b9b140d291077f8fd463d1b819e0596d10a593804a',
    'BOOT.md': 'ca1d11d779bd3813d7e7b93d50e88df0a107d240da136a386585f62c206f9a81',
    'MEMORY.md': 'e61a73c86459d18a4555fe1ad3e7acc8311e5c696bfdccfafcdb87e141cdff7c',
    'memory/2026-01-15.md': 'cfad4c09a6b72657e4c4064b154c37394a69e85759258d44abce4245a600f36d',
  },
};

const EXPECTED_FILE_KEYS = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
  'BOOT.md',
  'MEMORY.md',
  'memory/2026-01-15.md',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function main() {
  assert.equal(Array.isArray(PREDEFINED_AGENTS), true);
  assert.deepEqual(getAgentIds(), ['nyx', 'medea', 'arx', 'lev', 'mnemo']);
  assert.equal(getAgent('nyx').name, 'Nyx');

  const manifests = rosterManifest();
  assert.equal(manifests.length, PREDEFINED_AGENTS.length);

  for (const agent of PREDEFINED_AGENTS) {
    assert.equal(typeof agent.id, 'string');
    assert.equal(typeof agent.name, 'string');
    assert.equal(typeof agent.title, 'string');
    assert.equal(typeof agent.model, 'string');
    assert.equal(typeof agent.style, 'string');
    assert.equal(typeof agent.emoji, 'string');
    assert.equal(typeof agent.theme, 'string');
    assert.equal(typeof agent.mission, 'string');
    assert.equal(typeof agent.canonPolicy, 'string');
    assert.equal(Array.isArray(agent.workspaceFocus), true);
    assert.equal(Array.isArray(agent.toolsFocus), true);
    assert.equal(Array.isArray(agent.subagents), true);

    for (const subagentId of agent.subagents) {
      assert.ok(
        PREDEFINED_AGENTS.some((candidate) => candidate.id === subagentId),
        `Unknown subagent ${subagentId} referenced by ${agent.id}`
      );
    }

    const manifest = roleManifest(agent);
    assert.equal(manifest.id, agent.id);
    assert.deepEqual(manifest.subagents, agent.subagents);

    const files = agentWorkspaceFiles(
      agent,
      '2026-01-15',
      '../system/memory',
      '../system'
    );
    assert.deepEqual(Object.keys(files), EXPECTED_FILE_KEYS);

    for (const [fileName, content] of Object.entries(files)) {
      assert.equal(
        sha256(content),
        EXPECTED_HASHES[agent.id][fileName],
        `${agent.id}/${fileName} drifted from the frozen render output`
      );
    }

    const bundle = getRoleBundle(agent.id, {
      installDate: '2026-01-15',
      memoryPath: '../system/memory',
      systemPath: '../system',
    });
    assert.equal(bundle.manifest.id, agent.id);
    assert.deepEqual(bundle.files, files);
  }

  console.log(
    `Validated ${PREDEFINED_AGENTS.length} predefined role manifests and ${
      PREDEFINED_AGENTS.length * EXPECTED_FILE_KEYS.length
    } rendered agent workspace files through @nmc/memory-agents.`
  );
}

main();
