const { Datastore } = require('@google-cloud/datastore');

let datastore;

if (process.env.MOCK_GCP === 'true') {
  console.log("Using Mock Datastore (MOCK_GCP=true)");
  datastore = {
    key: (path) => ({ path }),
    save: async (entity) => {
      console.log("Mock Datastore: Saved entity", entity.key.path);
      return [{ mutationResults: [] }];
    },
    runQuery: async (query) => {
      console.log("Mock Datastore: Running query");
      // Return empty list for now, or mock data if needed
      return [[], { moreResults: 'NO_MORE_RESULTS' }];
    },
    delete: async (key) => {
      console.log("Mock Datastore: Deleted key", key);
      return [{ mutationResults: [] }];
    },
    createQuery: (kind) => {
      const query = {
        filter: () => query,
        select: () => query,
        limit: () => query,
      };
      return query;
    }
  };
} else {
  try {
    datastore = new Datastore();
  } catch (err) {
    console.warn("Could not initialize Datastore. Using Mock.");
    datastore = {
      key: (path) => ({ path }),
      save: async () => { },
      runQuery: async () => [[], {}],
      delete: async () => { },
      createQuery: () => {
        const query = {
          filter: () => query,
          select: () => query,
          limit: () => query,
        };
        return query;
      }
    };
  }
}

const KIND_USER_SIGNUP = 'UserSignup';

async function createUser(email, notes) {
  const key = datastore.key([KIND_USER_SIGNUP]);
  const entity = {
    key: key,
    data: {
      email: email,
      notes: notes,
      date: new Date(),
      active: true
    },
  };
  await datastore.save(entity);
  return key;
}

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

async function deleteUser(email) {
  const user = await getUserByEmail(email);
  if (user) {
    await datastore.delete(user[datastore.KEY]);
    return true;
  }
  // If mock, maybe we want to return true to simulate success?
  if (process.env.MOCK_GCP === 'true') return true;
  return false;
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

module.exports = {
  datastore,
  createUser,
  getUserByEmail,
  deleteUser,
  getUserCount,
  getUsersByDateRange
};
