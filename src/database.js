const { Datastore } = require('@google-cloud/datastore');

let datastore;

if (process.env.MOCK_GCP === 'true') {
  console.log("Using Mock Datastore (MOCK_GCP=true)");

  // Simple in-memory store
  const mockDb = new Map();

  datastore = {
    key: (path) => {
      // Handle array path correctly for kind/name
      const kind = path[0];
      const name = path[1] || (Date.now().toString() + Math.random().toString().substring(2));
      return { path: path, kind, name };
    },
    save: async (entity) => {
      // Handle array of entities or single entity
      const entities = Array.isArray(entity) ? entity : [entity];
      entities.forEach(e => {
        const keyName = e.key.name || e.key.id || Date.now().toString();
        const storeKey = `${e.key.kind}:${keyName}`;
        mockDb.set(storeKey, e.data);
        console.log(`Mock Datastore: Saved ${storeKey}`);
      });
      return [{ mutationResults: [] }];
    },
    runQuery: async (query) => {
      console.log(`Mock Datastore: Running query for kind ${query.kind}`);
      const results = [];
      for (const [key, data] of mockDb.entries()) {
        if (key.startsWith(query.kind + ':')) {
          // Rudimentary filter support (only equals for now if needed, but we mostly need all dates)
          results.push(data);
        }
      }
      return [results, { moreResults: 'NO_MORE_RESULTS' }];
    },
    get: async (key) => {
      const storeKey = `${key.kind}:${key.name}`;
      const data = mockDb.get(storeKey);
      console.log(`Mock Datastore: Get ${storeKey} -> ${data ? 'Found' : 'Not Found'}`);
      return data ? [data] : [];
    },
    delete: async (key) => {
      const storeKey = `${key.kind}:${key.name}`;
      mockDb.delete(storeKey);
      console.log(`Mock Datastore: Deleted ${storeKey}`);
      return [{ mutationResults: [] }];
    },
    createQuery: (kind) => {
      return { kind, select: () => ({ kind }), filter: () => ({ kind }) };
    }
  };
} else {
  try {
    datastore = new Datastore();
  } catch (err) {
    console.warn("Could not initialize Datastore. Using Mock.");
    // Fallback to stateless mock if initialization fails
    datastore = {
      key: (path) => ({ path }),
      save: async () => { },
      runQuery: async () => [[], {}],
      get: async () => [], // Added get for completeness
      delete: async () => { },
      createQuery: () => ({ kind: 'mock' })
    };
  }
}

const KIND_USER_SIGNUP = 'UserSignup';



async function getUserByEmail(email) {
  // For mock testing, if email is 'test@example.com', return a mock user?
  // Or just return null to allow signup.
  // Let's return null by default to allow signup flow.
  if (process.env.MOCK_GCP === 'true') {
    // If we want to test "User exists", we'd need more sophisticated mocking.
    // For now, let's assume empty DB.
  }

  const query = datastore.createQuery(KIND_USER_SIGNUP).filter('email', '=', email).limit(1);
  const [users] = await datastore.runQuery(query);
  return users.length > 0 ? users[0] : null;
}



async function getUserCount() {
  const query = datastore.createQuery(KIND_USER_SIGNUP).select('__key__');
  const [keys] = await datastore.runQuery(query);
  return keys.length;
}

async function getUsersByDateRange(year, startMonth, endMonth) {
  // Construct dates (Months are 0-indexed in JS Date, but 1-indexed in params)
  const startDate = new Date(Date.UTC(year, startMonth - 1, 1));

  // End date should be the 1st of the month AFTER endMonth
  // e.g. endMonth 7 (July) -> we want < Aug 1st.
  // JS Date(2009, 7, 1) is Aug 1st.
  const endDate = new Date(Date.UTC(year, endMonth, 1));

  console.log(`Querying users between ${startDate.toISOString()} and ${endDate.toISOString()}`);

  const query = datastore.createQuery(KIND_USER_SIGNUP)
    .filter('date', '>=', startDate)
    .filter('date', '<', endDate);

  const [users] = await datastore.runQuery(query);
  return users;
}

const KIND_MONTHLY_STATS = 'MonthlyStats';
const KIND_GLOBAL_STATS = 'GlobalStats';
const STATS_KEY_NAME = 'signup_visualization';

// Helper to format key, e.g., "2023-10"
function getMonthKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function updateMonthlyCount(transaction, date, change) {
  const monthKey = getMonthKey(date);
  const key = datastore.key([KIND_MONTHLY_STATS, monthKey]);

  // Try to get existing counter
  const [entity] = await transaction.get(key);

  let count = 0;
  if (entity && entity.count) {
    count = entity.count;
  }

  count += change;

  transaction.save({
    key: key,
    data: {
      count: count,
      month: monthKey // descriptive field
    }
  });
}

async function createUser(email, notes) {
  const key = datastore.key([KIND_USER_SIGNUP]);
  const date = new Date();

  const entity = {
    key: key,
    data: {
      email: email,
      notes: notes,
      date: date,
      active: true
    },
  };

  if (process.env.MOCK_GCP === 'true') {
    await datastore.save(entity);
    // Mock transaction for counter not fully implemented in simple mock, 
    // but we can manually save the stats for the mock if needed.
    return key;
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();
    transaction.save(entity);
    await updateMonthlyCount(transaction, date, 1);
    await transaction.commit();
    return key;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function deleteUser(email) {
  if (process.env.MOCK_GCP === 'true') {
    // Simple mock delete
    const user = await getUserByEmail(email);
    if (user) await datastore.delete(user[datastore.KEY]);
    return true;
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();

    // We need to fetch the user inside the transaction to get their date
    const query = datastore.createQuery(KIND_USER_SIGNUP).filter('email', '=', email).limit(1);
    const [users] = await transaction.runQuery(query);
    const user = users.length > 0 ? users[0] : null;

    if (!user) {
      await transaction.rollback();
      return false; // User not found
    }

    transaction.delete(user[datastore.KEY]);

    if (user.date) {
      await updateMonthlyCount(transaction, user.date, -1);
    }

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getMonthlyCounts() {
  const query = datastore.createQuery(KIND_MONTHLY_STATS);
  const [entities] = await datastore.runQuery(query);
  // Transform to simpler object { "2023-01": 5, ... }
  const counts = {};
  entities.forEach(e => {
    // Use key name or 'month' property
    const keyName = e[datastore.KEY].name;
    counts[keyName] = e.count;
  });
  return counts;
}

// Deprecated: getSignupDates is O(N) and should be avoided or used only for migration
async function getSignupDates() {
  const query = datastore.createQuery(KIND_USER_SIGNUP).select(['date']);
  const [entities] = await datastore.runQuery(query);
  return entities.map(e => e.date);
}

async function saveStats(statsData) {
  const key = datastore.key([KIND_GLOBAL_STATS, STATS_KEY_NAME]);
  const entity = {
    key: key,
    data: {
      stats: JSON.stringify(statsData),
      updatedAt: new Date()
    },
    excludeFromIndexes: ['stats']
  };
  await datastore.save(entity);
  return key;
}

async function getStats() {
  const key = datastore.key([KIND_GLOBAL_STATS, STATS_KEY_NAME]);
  const [entity] = await datastore.get(key);
  if (entity && entity.stats) {
    return JSON.parse(entity.stats);
  }
  return null;
}

module.exports = {
  datastore,
  createUser,
  getUserByEmail,
  deleteUser,
  getUserCount,
  getUsersByDateRange,
  getSignupDates, // Kept for migration
  getMonthlyCounts,
  saveStats,
  getStats,
  KIND_MONTHLY_STATS
};
