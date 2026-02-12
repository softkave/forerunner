import {ConsoleForeLogger} from '../../utils/exports.js';
import {
  closeMongoClient,
  getMongoClient,
  GetMongoClientParams,
} from '../connection.js';
import {MongoUser} from './types.js';

export interface UserChange {
  user: MongoUser;
  passwordChanged: boolean;
  rolesAdded: Array<{role: string; db: string}>;
  rolesRemoved: Array<{role: string; db: string}>;
}

export interface UserChanges {
  added: MongoUser[];
  removed: MongoUser[];
  updated: UserChange[];
}

/**
 * Update MongoDB user password using updateUser command.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function updateMongoUserPassword(
  params: {
    user: MongoUser;
  } & GetMongoClientParams
): Promise<void> {
  const {user, logger = new ConsoleForeLogger({silent: true})} = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');
    const result = await db.command({
      updateUser: user.username,
      pwd: user.password,
    });

    logger.log(
      `Password update for user ${user.username}: ${result.ok ? 'success' : 'failed'}`
    );
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Update MongoDB user roles using grantRolesToUser and revokeRolesFromUser commands.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function updateMongoUserRoles(
  params: {
    user: MongoUser;
    rolesToAdd: Array<{role: string; db: string}>;
    rolesToRemove: Array<{role: string; db: string}>;
  } & GetMongoClientParams
): Promise<void> {
  const {
    user,
    rolesToAdd,
    rolesToRemove,
    logger = new ConsoleForeLogger({silent: true}),
  } = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');

    if (rolesToAdd.length > 0) {
      const result = await db.command({
        grantRolesToUser: user.username,
        roles: rolesToAdd,
      });
      logger.log(
        `Grant roles to user ${user.username}: ${result.ok ? 'success' : 'failed'}`
      );
    }

    if (rolesToRemove.length > 0) {
      const result = await db.command({
        revokeRolesFromUser: user.username,
        roles: rolesToRemove,
      });
      logger.log(
        `Revoke roles from user ${user.username}: ${result.ok ? 'success' : 'failed'}`
      );
    }
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Update MongoDB user (password and/or roles).
 * Updates password first if changed, then updates roles.
 * Reuses client connection when possible to avoid multiple connections.
 */
export async function updateMongoUser(
  params: {
    user: MongoUser;
    passwordChanged: boolean;
    rolesAdded: Array<{role: string; db: string}>;
    rolesRemoved: Array<{role: string; db: string}>;
  } & GetMongoClientParams
): Promise<void> {
  const {user, passwordChanged, rolesAdded, rolesRemoved} = params;

  const client = await getMongoClient(params);

  try {
    if (passwordChanged) {
      await updateMongoUserPassword({
        ...params,
        client,
      });
    }

    if (rolesAdded.length > 0 || rolesRemoved.length > 0) {
      await updateMongoUserRoles({
        ...params,
        client,
        rolesToAdd: rolesAdded,
        rolesToRemove: rolesRemoved,
      });
    }
  } finally {
    await closeMongoClient(client, params);
  }
}

/**
 * Remove MongoDB user using dropUser command.
 * Requires admin user with userAdmin privileges on the user's authDb.
 */
export async function removeMongoUser(
  params: {
    user: MongoUser;
  } & GetMongoClientParams
): Promise<void> {
  const {user, logger = new ConsoleForeLogger({silent: true})} = params;

  const client = await getMongoClient(params);

  try {
    const db = client.db(user.authDb || 'admin');
    const result = await db.command({
      dropUser: user.username,
    });

    logger.log(
      `Remove user ${user.username}: ${result.ok ? 'success' : 'failed'}`
    );
  } finally {
    await closeMongoClient(client, params);
  }
}
