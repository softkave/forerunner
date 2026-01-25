import z from 'zod';

export const MongoUserSchema = z.object({
  username: z.string(),
  password: z.string(),
  authDb: z.string().optional(),
  roles: z.array(
    z.object({
      role: z
        .enum([
          'userAdminAnyDatabase',
          'readAnyDatabase',
          'clusterAdmin',
          'readWrite',
          'read',
        ])
        .or(z.string()),
      db: z.string(),
    })
  ),
});

export const MongoUserListSchema = z.array(MongoUserSchema);

export type MongoUser = z.infer<typeof MongoUserSchema>;
export type MongoUserList = z.infer<typeof MongoUserListSchema>;
