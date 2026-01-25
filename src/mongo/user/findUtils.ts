import {MongoUser, MongoUserList} from './types.js';

export function findAdminUser<
  TRequired extends boolean = true,
  TReturn = TRequired extends true ? MongoUser : MongoUser | undefined,
>(params: {users: MongoUserList; isRequired?: TRequired}): TReturn {
  const {users, isRequired = true} = params;

  const adminUser = users.find(user =>
    user.roles.some(role => role.role === 'userAdminAnyDatabase')
  );

  if (!adminUser && isRequired) {
    throw new Error('Admin user not found');
  }

  return adminUser as TReturn;
}

export function findClusterAdminUser<
  TRequired extends boolean = true,
  TReturn = TRequired extends true ? MongoUser : MongoUser | undefined,
>(params: {users: MongoUserList; isRequired?: TRequired}): TReturn {
  const {users, isRequired = true} = params;

  const clusterAdminUser = users.find(user =>
    user.roles.some(role => role.role === 'clusterAdmin')
  );

  if (!clusterAdminUser && isRequired) {
    throw new Error('Cluster admin user not found');
  }

  return clusterAdminUser as TReturn;
}
