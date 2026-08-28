
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Tenant
 * 
 */
export type Tenant = $Result.DefaultSelection<Prisma.$TenantPayload>
/**
 * Model TenantConfigurationVersion
 * 
 */
export type TenantConfigurationVersion = $Result.DefaultSelection<Prisma.$TenantConfigurationVersionPayload>
/**
 * Model LegalEntity
 * 
 */
export type LegalEntity = $Result.DefaultSelection<Prisma.$LegalEntityPayload>
/**
 * Model BusinessUnit
 * 
 */
export type BusinessUnit = $Result.DefaultSelection<Prisma.$BusinessUnitPayload>
/**
 * Model Branch
 * 
 */
export type Branch = $Result.DefaultSelection<Prisma.$BranchPayload>
/**
 * Model Factory
 * 
 */
export type Factory = $Result.DefaultSelection<Prisma.$FactoryPayload>
/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Role
 * 
 */
export type Role = $Result.DefaultSelection<Prisma.$RolePayload>
/**
 * Model RolePermission
 * 
 */
export type RolePermission = $Result.DefaultSelection<Prisma.$RolePermissionPayload>
/**
 * Model UserRoleAssignment
 * 
 */
export type UserRoleAssignment = $Result.DefaultSelection<Prisma.$UserRoleAssignmentPayload>
/**
 * Model AuditEvent
 * 
 */
export type AuditEvent = $Result.DefaultSelection<Prisma.$AuditEventPayload>
/**
 * Model OutboxEvent
 * 
 */
export type OutboxEvent = $Result.DefaultSelection<Prisma.$OutboxEventPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const TenantStatus: {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED'
};

export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus]


export const UserStatus: {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED'
};

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]


export const ScopeType: {
  TENANT: 'TENANT',
  LEGAL_ENTITY: 'LEGAL_ENTITY',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  BRANCH: 'BRANCH',
  FACTORY: 'FACTORY'
};

export type ScopeType = (typeof ScopeType)[keyof typeof ScopeType]


export const ActorType: {
  USER: 'USER',
  SERVICE: 'SERVICE',
  SYSTEM: 'SYSTEM'
};

export type ActorType = (typeof ActorType)[keyof typeof ActorType]


export const OutboxStatus: {
  PENDING: 'PENDING',
  DISPATCHED: 'DISPATCHED',
  FAILED: 'FAILED'
};

export type OutboxStatus = (typeof OutboxStatus)[keyof typeof OutboxStatus]

}

export type TenantStatus = $Enums.TenantStatus

export const TenantStatus: typeof $Enums.TenantStatus

export type UserStatus = $Enums.UserStatus

export const UserStatus: typeof $Enums.UserStatus

export type ScopeType = $Enums.ScopeType

export const ScopeType: typeof $Enums.ScopeType

export type ActorType = $Enums.ActorType

export const ActorType: typeof $Enums.ActorType

export type OutboxStatus = $Enums.OutboxStatus

export const OutboxStatus: typeof $Enums.OutboxStatus

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Tenants
 * const tenants = await prisma.tenant.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Tenants
   * const tenants = await prisma.tenant.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.tenant`: Exposes CRUD operations for the **Tenant** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Tenants
    * const tenants = await prisma.tenant.findMany()
    * ```
    */
  get tenant(): Prisma.TenantDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tenantConfigurationVersion`: Exposes CRUD operations for the **TenantConfigurationVersion** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TenantConfigurationVersions
    * const tenantConfigurationVersions = await prisma.tenantConfigurationVersion.findMany()
    * ```
    */
  get tenantConfigurationVersion(): Prisma.TenantConfigurationVersionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.legalEntity`: Exposes CRUD operations for the **LegalEntity** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more LegalEntities
    * const legalEntities = await prisma.legalEntity.findMany()
    * ```
    */
  get legalEntity(): Prisma.LegalEntityDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.businessUnit`: Exposes CRUD operations for the **BusinessUnit** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more BusinessUnits
    * const businessUnits = await prisma.businessUnit.findMany()
    * ```
    */
  get businessUnit(): Prisma.BusinessUnitDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.branch`: Exposes CRUD operations for the **Branch** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Branches
    * const branches = await prisma.branch.findMany()
    * ```
    */
  get branch(): Prisma.BranchDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.factory`: Exposes CRUD operations for the **Factory** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Factories
    * const factories = await prisma.factory.findMany()
    * ```
    */
  get factory(): Prisma.FactoryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.role`: Exposes CRUD operations for the **Role** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Roles
    * const roles = await prisma.role.findMany()
    * ```
    */
  get role(): Prisma.RoleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.rolePermission`: Exposes CRUD operations for the **RolePermission** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RolePermissions
    * const rolePermissions = await prisma.rolePermission.findMany()
    * ```
    */
  get rolePermission(): Prisma.RolePermissionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.userRoleAssignment`: Exposes CRUD operations for the **UserRoleAssignment** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more UserRoleAssignments
    * const userRoleAssignments = await prisma.userRoleAssignment.findMany()
    * ```
    */
  get userRoleAssignment(): Prisma.UserRoleAssignmentDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.auditEvent`: Exposes CRUD operations for the **AuditEvent** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AuditEvents
    * const auditEvents = await prisma.auditEvent.findMany()
    * ```
    */
  get auditEvent(): Prisma.AuditEventDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.outboxEvent`: Exposes CRUD operations for the **OutboxEvent** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more OutboxEvents
    * const outboxEvents = await prisma.outboxEvent.findMany()
    * ```
    */
  get outboxEvent(): Prisma.OutboxEventDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.3
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Tenant: 'Tenant',
    TenantConfigurationVersion: 'TenantConfigurationVersion',
    LegalEntity: 'LegalEntity',
    BusinessUnit: 'BusinessUnit',
    Branch: 'Branch',
    Factory: 'Factory',
    User: 'User',
    Role: 'Role',
    RolePermission: 'RolePermission',
    UserRoleAssignment: 'UserRoleAssignment',
    AuditEvent: 'AuditEvent',
    OutboxEvent: 'OutboxEvent'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "tenant" | "tenantConfigurationVersion" | "legalEntity" | "businessUnit" | "branch" | "factory" | "user" | "role" | "rolePermission" | "userRoleAssignment" | "auditEvent" | "outboxEvent"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Tenant: {
        payload: Prisma.$TenantPayload<ExtArgs>
        fields: Prisma.TenantFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TenantFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TenantFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          findFirst: {
            args: Prisma.TenantFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TenantFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          findMany: {
            args: Prisma.TenantFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>[]
          }
          create: {
            args: Prisma.TenantCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          createMany: {
            args: Prisma.TenantCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TenantCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>[]
          }
          delete: {
            args: Prisma.TenantDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          update: {
            args: Prisma.TenantUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          deleteMany: {
            args: Prisma.TenantDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TenantUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TenantUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>[]
          }
          upsert: {
            args: Prisma.TenantUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          aggregate: {
            args: Prisma.TenantAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTenant>
          }
          groupBy: {
            args: Prisma.TenantGroupByArgs<ExtArgs>
            result: $Utils.Optional<TenantGroupByOutputType>[]
          }
          count: {
            args: Prisma.TenantCountArgs<ExtArgs>
            result: $Utils.Optional<TenantCountAggregateOutputType> | number
          }
        }
      }
      TenantConfigurationVersion: {
        payload: Prisma.$TenantConfigurationVersionPayload<ExtArgs>
        fields: Prisma.TenantConfigurationVersionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TenantConfigurationVersionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TenantConfigurationVersionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          findFirst: {
            args: Prisma.TenantConfigurationVersionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TenantConfigurationVersionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          findMany: {
            args: Prisma.TenantConfigurationVersionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>[]
          }
          create: {
            args: Prisma.TenantConfigurationVersionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          createMany: {
            args: Prisma.TenantConfigurationVersionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TenantConfigurationVersionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>[]
          }
          delete: {
            args: Prisma.TenantConfigurationVersionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          update: {
            args: Prisma.TenantConfigurationVersionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          deleteMany: {
            args: Prisma.TenantConfigurationVersionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TenantConfigurationVersionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TenantConfigurationVersionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>[]
          }
          upsert: {
            args: Prisma.TenantConfigurationVersionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantConfigurationVersionPayload>
          }
          aggregate: {
            args: Prisma.TenantConfigurationVersionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTenantConfigurationVersion>
          }
          groupBy: {
            args: Prisma.TenantConfigurationVersionGroupByArgs<ExtArgs>
            result: $Utils.Optional<TenantConfigurationVersionGroupByOutputType>[]
          }
          count: {
            args: Prisma.TenantConfigurationVersionCountArgs<ExtArgs>
            result: $Utils.Optional<TenantConfigurationVersionCountAggregateOutputType> | number
          }
        }
      }
      LegalEntity: {
        payload: Prisma.$LegalEntityPayload<ExtArgs>
        fields: Prisma.LegalEntityFieldRefs
        operations: {
          findUnique: {
            args: Prisma.LegalEntityFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.LegalEntityFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          findFirst: {
            args: Prisma.LegalEntityFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.LegalEntityFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          findMany: {
            args: Prisma.LegalEntityFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>[]
          }
          create: {
            args: Prisma.LegalEntityCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          createMany: {
            args: Prisma.LegalEntityCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.LegalEntityCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>[]
          }
          delete: {
            args: Prisma.LegalEntityDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          update: {
            args: Prisma.LegalEntityUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          deleteMany: {
            args: Prisma.LegalEntityDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.LegalEntityUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.LegalEntityUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>[]
          }
          upsert: {
            args: Prisma.LegalEntityUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LegalEntityPayload>
          }
          aggregate: {
            args: Prisma.LegalEntityAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateLegalEntity>
          }
          groupBy: {
            args: Prisma.LegalEntityGroupByArgs<ExtArgs>
            result: $Utils.Optional<LegalEntityGroupByOutputType>[]
          }
          count: {
            args: Prisma.LegalEntityCountArgs<ExtArgs>
            result: $Utils.Optional<LegalEntityCountAggregateOutputType> | number
          }
        }
      }
      BusinessUnit: {
        payload: Prisma.$BusinessUnitPayload<ExtArgs>
        fields: Prisma.BusinessUnitFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BusinessUnitFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BusinessUnitFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          findFirst: {
            args: Prisma.BusinessUnitFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BusinessUnitFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          findMany: {
            args: Prisma.BusinessUnitFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>[]
          }
          create: {
            args: Prisma.BusinessUnitCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          createMany: {
            args: Prisma.BusinessUnitCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BusinessUnitCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>[]
          }
          delete: {
            args: Prisma.BusinessUnitDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          update: {
            args: Prisma.BusinessUnitUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          deleteMany: {
            args: Prisma.BusinessUnitDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BusinessUnitUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BusinessUnitUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>[]
          }
          upsert: {
            args: Prisma.BusinessUnitUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BusinessUnitPayload>
          }
          aggregate: {
            args: Prisma.BusinessUnitAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBusinessUnit>
          }
          groupBy: {
            args: Prisma.BusinessUnitGroupByArgs<ExtArgs>
            result: $Utils.Optional<BusinessUnitGroupByOutputType>[]
          }
          count: {
            args: Prisma.BusinessUnitCountArgs<ExtArgs>
            result: $Utils.Optional<BusinessUnitCountAggregateOutputType> | number
          }
        }
      }
      Branch: {
        payload: Prisma.$BranchPayload<ExtArgs>
        fields: Prisma.BranchFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BranchFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BranchFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          findFirst: {
            args: Prisma.BranchFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BranchFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          findMany: {
            args: Prisma.BranchFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>[]
          }
          create: {
            args: Prisma.BranchCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          createMany: {
            args: Prisma.BranchCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BranchCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>[]
          }
          delete: {
            args: Prisma.BranchDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          update: {
            args: Prisma.BranchUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          deleteMany: {
            args: Prisma.BranchDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BranchUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BranchUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>[]
          }
          upsert: {
            args: Prisma.BranchUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BranchPayload>
          }
          aggregate: {
            args: Prisma.BranchAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBranch>
          }
          groupBy: {
            args: Prisma.BranchGroupByArgs<ExtArgs>
            result: $Utils.Optional<BranchGroupByOutputType>[]
          }
          count: {
            args: Prisma.BranchCountArgs<ExtArgs>
            result: $Utils.Optional<BranchCountAggregateOutputType> | number
          }
        }
      }
      Factory: {
        payload: Prisma.$FactoryPayload<ExtArgs>
        fields: Prisma.FactoryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.FactoryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.FactoryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          findFirst: {
            args: Prisma.FactoryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.FactoryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          findMany: {
            args: Prisma.FactoryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>[]
          }
          create: {
            args: Prisma.FactoryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          createMany: {
            args: Prisma.FactoryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.FactoryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>[]
          }
          delete: {
            args: Prisma.FactoryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          update: {
            args: Prisma.FactoryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          deleteMany: {
            args: Prisma.FactoryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.FactoryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.FactoryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>[]
          }
          upsert: {
            args: Prisma.FactoryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FactoryPayload>
          }
          aggregate: {
            args: Prisma.FactoryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateFactory>
          }
          groupBy: {
            args: Prisma.FactoryGroupByArgs<ExtArgs>
            result: $Utils.Optional<FactoryGroupByOutputType>[]
          }
          count: {
            args: Prisma.FactoryCountArgs<ExtArgs>
            result: $Utils.Optional<FactoryCountAggregateOutputType> | number
          }
        }
      }
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Role: {
        payload: Prisma.$RolePayload<ExtArgs>
        fields: Prisma.RoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findFirst: {
            args: Prisma.RoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findMany: {
            args: Prisma.RoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          create: {
            args: Prisma.RoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          createMany: {
            args: Prisma.RoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RoleCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          delete: {
            args: Prisma.RoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          update: {
            args: Prisma.RoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          deleteMany: {
            args: Prisma.RoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.RoleUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          upsert: {
            args: Prisma.RoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          aggregate: {
            args: Prisma.RoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRole>
          }
          groupBy: {
            args: Prisma.RoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<RoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.RoleCountArgs<ExtArgs>
            result: $Utils.Optional<RoleCountAggregateOutputType> | number
          }
        }
      }
      RolePermission: {
        payload: Prisma.$RolePermissionPayload<ExtArgs>
        fields: Prisma.RolePermissionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RolePermissionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RolePermissionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          findFirst: {
            args: Prisma.RolePermissionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RolePermissionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          findMany: {
            args: Prisma.RolePermissionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>[]
          }
          create: {
            args: Prisma.RolePermissionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          createMany: {
            args: Prisma.RolePermissionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RolePermissionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>[]
          }
          delete: {
            args: Prisma.RolePermissionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          update: {
            args: Prisma.RolePermissionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          deleteMany: {
            args: Prisma.RolePermissionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RolePermissionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.RolePermissionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>[]
          }
          upsert: {
            args: Prisma.RolePermissionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePermissionPayload>
          }
          aggregate: {
            args: Prisma.RolePermissionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRolePermission>
          }
          groupBy: {
            args: Prisma.RolePermissionGroupByArgs<ExtArgs>
            result: $Utils.Optional<RolePermissionGroupByOutputType>[]
          }
          count: {
            args: Prisma.RolePermissionCountArgs<ExtArgs>
            result: $Utils.Optional<RolePermissionCountAggregateOutputType> | number
          }
        }
      }
      UserRoleAssignment: {
        payload: Prisma.$UserRoleAssignmentPayload<ExtArgs>
        fields: Prisma.UserRoleAssignmentFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserRoleAssignmentFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserRoleAssignmentFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          findFirst: {
            args: Prisma.UserRoleAssignmentFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserRoleAssignmentFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          findMany: {
            args: Prisma.UserRoleAssignmentFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>[]
          }
          create: {
            args: Prisma.UserRoleAssignmentCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          createMany: {
            args: Prisma.UserRoleAssignmentCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserRoleAssignmentCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>[]
          }
          delete: {
            args: Prisma.UserRoleAssignmentDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          update: {
            args: Prisma.UserRoleAssignmentUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          deleteMany: {
            args: Prisma.UserRoleAssignmentDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserRoleAssignmentUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserRoleAssignmentUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>[]
          }
          upsert: {
            args: Prisma.UserRoleAssignmentUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserRoleAssignmentPayload>
          }
          aggregate: {
            args: Prisma.UserRoleAssignmentAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUserRoleAssignment>
          }
          groupBy: {
            args: Prisma.UserRoleAssignmentGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserRoleAssignmentGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserRoleAssignmentCountArgs<ExtArgs>
            result: $Utils.Optional<UserRoleAssignmentCountAggregateOutputType> | number
          }
        }
      }
      AuditEvent: {
        payload: Prisma.$AuditEventPayload<ExtArgs>
        fields: Prisma.AuditEventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AuditEventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AuditEventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          findFirst: {
            args: Prisma.AuditEventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AuditEventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          findMany: {
            args: Prisma.AuditEventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          create: {
            args: Prisma.AuditEventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          createMany: {
            args: Prisma.AuditEventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.AuditEventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          delete: {
            args: Prisma.AuditEventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          update: {
            args: Prisma.AuditEventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          deleteMany: {
            args: Prisma.AuditEventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AuditEventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.AuditEventUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>[]
          }
          upsert: {
            args: Prisma.AuditEventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuditEventPayload>
          }
          aggregate: {
            args: Prisma.AuditEventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAuditEvent>
          }
          groupBy: {
            args: Prisma.AuditEventGroupByArgs<ExtArgs>
            result: $Utils.Optional<AuditEventGroupByOutputType>[]
          }
          count: {
            args: Prisma.AuditEventCountArgs<ExtArgs>
            result: $Utils.Optional<AuditEventCountAggregateOutputType> | number
          }
        }
      }
      OutboxEvent: {
        payload: Prisma.$OutboxEventPayload<ExtArgs>
        fields: Prisma.OutboxEventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OutboxEventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OutboxEventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          findFirst: {
            args: Prisma.OutboxEventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OutboxEventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          findMany: {
            args: Prisma.OutboxEventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>[]
          }
          create: {
            args: Prisma.OutboxEventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          createMany: {
            args: Prisma.OutboxEventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.OutboxEventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>[]
          }
          delete: {
            args: Prisma.OutboxEventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          update: {
            args: Prisma.OutboxEventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          deleteMany: {
            args: Prisma.OutboxEventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OutboxEventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.OutboxEventUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>[]
          }
          upsert: {
            args: Prisma.OutboxEventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OutboxEventPayload>
          }
          aggregate: {
            args: Prisma.OutboxEventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOutboxEvent>
          }
          groupBy: {
            args: Prisma.OutboxEventGroupByArgs<ExtArgs>
            result: $Utils.Optional<OutboxEventGroupByOutputType>[]
          }
          count: {
            args: Prisma.OutboxEventCountArgs<ExtArgs>
            result: $Utils.Optional<OutboxEventCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    tenant?: TenantOmit
    tenantConfigurationVersion?: TenantConfigurationVersionOmit
    legalEntity?: LegalEntityOmit
    businessUnit?: BusinessUnitOmit
    branch?: BranchOmit
    factory?: FactoryOmit
    user?: UserOmit
    role?: RoleOmit
    rolePermission?: RolePermissionOmit
    userRoleAssignment?: UserRoleAssignmentOmit
    auditEvent?: AuditEventOmit
    outboxEvent?: OutboxEventOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type TenantCountOutputType
   */

  export type TenantCountOutputType = {
    configurationVersions: number
    legalEntities: number
    businessUnits: number
    branches: number
    factories: number
    users: number
    roles: number
    roleAssignments: number
    auditEvents: number
    outboxEvents: number
  }

  export type TenantCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    configurationVersions?: boolean | TenantCountOutputTypeCountConfigurationVersionsArgs
    legalEntities?: boolean | TenantCountOutputTypeCountLegalEntitiesArgs
    businessUnits?: boolean | TenantCountOutputTypeCountBusinessUnitsArgs
    branches?: boolean | TenantCountOutputTypeCountBranchesArgs
    factories?: boolean | TenantCountOutputTypeCountFactoriesArgs
    users?: boolean | TenantCountOutputTypeCountUsersArgs
    roles?: boolean | TenantCountOutputTypeCountRolesArgs
    roleAssignments?: boolean | TenantCountOutputTypeCountRoleAssignmentsArgs
    auditEvents?: boolean | TenantCountOutputTypeCountAuditEventsArgs
    outboxEvents?: boolean | TenantCountOutputTypeCountOutboxEventsArgs
  }

  // Custom InputTypes
  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantCountOutputType
     */
    select?: TenantCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountConfigurationVersionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantConfigurationVersionWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountLegalEntitiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LegalEntityWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountBusinessUnitsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BusinessUnitWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountBranchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BranchWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountFactoriesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: FactoryWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountUsersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountRoleAssignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserRoleAssignmentWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountAuditEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditEventWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountOutboxEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OutboxEventWhereInput
  }


  /**
   * Count Type LegalEntityCountOutputType
   */

  export type LegalEntityCountOutputType = {
    businessUnits: number
  }

  export type LegalEntityCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    businessUnits?: boolean | LegalEntityCountOutputTypeCountBusinessUnitsArgs
  }

  // Custom InputTypes
  /**
   * LegalEntityCountOutputType without action
   */
  export type LegalEntityCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntityCountOutputType
     */
    select?: LegalEntityCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * LegalEntityCountOutputType without action
   */
  export type LegalEntityCountOutputTypeCountBusinessUnitsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BusinessUnitWhereInput
  }


  /**
   * Count Type BusinessUnitCountOutputType
   */

  export type BusinessUnitCountOutputType = {
    children: number
    branches: number
    factories: number
  }

  export type BusinessUnitCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    children?: boolean | BusinessUnitCountOutputTypeCountChildrenArgs
    branches?: boolean | BusinessUnitCountOutputTypeCountBranchesArgs
    factories?: boolean | BusinessUnitCountOutputTypeCountFactoriesArgs
  }

  // Custom InputTypes
  /**
   * BusinessUnitCountOutputType without action
   */
  export type BusinessUnitCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnitCountOutputType
     */
    select?: BusinessUnitCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * BusinessUnitCountOutputType without action
   */
  export type BusinessUnitCountOutputTypeCountChildrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BusinessUnitWhereInput
  }

  /**
   * BusinessUnitCountOutputType without action
   */
  export type BusinessUnitCountOutputTypeCountBranchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BranchWhereInput
  }

  /**
   * BusinessUnitCountOutputType without action
   */
  export type BusinessUnitCountOutputTypeCountFactoriesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: FactoryWhereInput
  }


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    roleAssignments: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roleAssignments?: boolean | UserCountOutputTypeCountRoleAssignmentsArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountRoleAssignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserRoleAssignmentWhereInput
  }


  /**
   * Count Type RoleCountOutputType
   */

  export type RoleCountOutputType = {
    permissions: number
    assignments: number
  }

  export type RoleCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    permissions?: boolean | RoleCountOutputTypeCountPermissionsArgs
    assignments?: boolean | RoleCountOutputTypeCountAssignmentsArgs
  }

  // Custom InputTypes
  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RoleCountOutputType
     */
    select?: RoleCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountPermissionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RolePermissionWhereInput
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountAssignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserRoleAssignmentWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Tenant
   */

  export type AggregateTenant = {
    _count: TenantCountAggregateOutputType | null
    _avg: TenantAvgAggregateOutputType | null
    _sum: TenantSumAggregateOutputType | null
    _min: TenantMinAggregateOutputType | null
    _max: TenantMaxAggregateOutputType | null
  }

  export type TenantAvgAggregateOutputType = {
    version: number | null
  }

  export type TenantSumAggregateOutputType = {
    version: number | null
  }

  export type TenantMinAggregateOutputType = {
    id: string | null
    slug: string | null
    name: string | null
    status: $Enums.TenantStatus | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TenantMaxAggregateOutputType = {
    id: string | null
    slug: string | null
    name: string | null
    status: $Enums.TenantStatus | null
    version: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TenantCountAggregateOutputType = {
    id: number
    slug: number
    name: number
    status: number
    version: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type TenantAvgAggregateInputType = {
    version?: true
  }

  export type TenantSumAggregateInputType = {
    version?: true
  }

  export type TenantMinAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    status?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TenantMaxAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    status?: true
    version?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TenantCountAggregateInputType = {
    id?: true
    slug?: true
    name?: true
    status?: true
    version?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type TenantAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tenant to aggregate.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Tenants
    **/
    _count?: true | TenantCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TenantAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TenantSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TenantMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TenantMaxAggregateInputType
  }

  export type GetTenantAggregateType<T extends TenantAggregateArgs> = {
        [P in keyof T & keyof AggregateTenant]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTenant[P]>
      : GetScalarType<T[P], AggregateTenant[P]>
  }




  export type TenantGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantWhereInput
    orderBy?: TenantOrderByWithAggregationInput | TenantOrderByWithAggregationInput[]
    by: TenantScalarFieldEnum[] | TenantScalarFieldEnum
    having?: TenantScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TenantCountAggregateInputType | true
    _avg?: TenantAvgAggregateInputType
    _sum?: TenantSumAggregateInputType
    _min?: TenantMinAggregateInputType
    _max?: TenantMaxAggregateInputType
  }

  export type TenantGroupByOutputType = {
    id: string
    slug: string
    name: string
    status: $Enums.TenantStatus
    version: number
    createdAt: Date
    updatedAt: Date
    _count: TenantCountAggregateOutputType | null
    _avg: TenantAvgAggregateOutputType | null
    _sum: TenantSumAggregateOutputType | null
    _min: TenantMinAggregateOutputType | null
    _max: TenantMaxAggregateOutputType | null
  }

  type GetTenantGroupByPayload<T extends TenantGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TenantGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TenantGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TenantGroupByOutputType[P]>
            : GetScalarType<T[P], TenantGroupByOutputType[P]>
        }
      >
    >


  export type TenantSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    slug?: boolean
    name?: boolean
    status?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    configurationVersions?: boolean | Tenant$configurationVersionsArgs<ExtArgs>
    legalEntities?: boolean | Tenant$legalEntitiesArgs<ExtArgs>
    businessUnits?: boolean | Tenant$businessUnitsArgs<ExtArgs>
    branches?: boolean | Tenant$branchesArgs<ExtArgs>
    factories?: boolean | Tenant$factoriesArgs<ExtArgs>
    users?: boolean | Tenant$usersArgs<ExtArgs>
    roles?: boolean | Tenant$rolesArgs<ExtArgs>
    roleAssignments?: boolean | Tenant$roleAssignmentsArgs<ExtArgs>
    auditEvents?: boolean | Tenant$auditEventsArgs<ExtArgs>
    outboxEvents?: boolean | Tenant$outboxEventsArgs<ExtArgs>
    _count?: boolean | TenantCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenant"]>

  export type TenantSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    slug?: boolean
    name?: boolean
    status?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["tenant"]>

  export type TenantSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    slug?: boolean
    name?: boolean
    status?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["tenant"]>

  export type TenantSelectScalar = {
    id?: boolean
    slug?: boolean
    name?: boolean
    status?: boolean
    version?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type TenantOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "slug" | "name" | "status" | "version" | "createdAt" | "updatedAt", ExtArgs["result"]["tenant"]>
  export type TenantInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    configurationVersions?: boolean | Tenant$configurationVersionsArgs<ExtArgs>
    legalEntities?: boolean | Tenant$legalEntitiesArgs<ExtArgs>
    businessUnits?: boolean | Tenant$businessUnitsArgs<ExtArgs>
    branches?: boolean | Tenant$branchesArgs<ExtArgs>
    factories?: boolean | Tenant$factoriesArgs<ExtArgs>
    users?: boolean | Tenant$usersArgs<ExtArgs>
    roles?: boolean | Tenant$rolesArgs<ExtArgs>
    roleAssignments?: boolean | Tenant$roleAssignmentsArgs<ExtArgs>
    auditEvents?: boolean | Tenant$auditEventsArgs<ExtArgs>
    outboxEvents?: boolean | Tenant$outboxEventsArgs<ExtArgs>
    _count?: boolean | TenantCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type TenantIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type TenantIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $TenantPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Tenant"
    objects: {
      configurationVersions: Prisma.$TenantConfigurationVersionPayload<ExtArgs>[]
      legalEntities: Prisma.$LegalEntityPayload<ExtArgs>[]
      businessUnits: Prisma.$BusinessUnitPayload<ExtArgs>[]
      branches: Prisma.$BranchPayload<ExtArgs>[]
      factories: Prisma.$FactoryPayload<ExtArgs>[]
      users: Prisma.$UserPayload<ExtArgs>[]
      roles: Prisma.$RolePayload<ExtArgs>[]
      roleAssignments: Prisma.$UserRoleAssignmentPayload<ExtArgs>[]
      auditEvents: Prisma.$AuditEventPayload<ExtArgs>[]
      outboxEvents: Prisma.$OutboxEventPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      slug: string
      name: string
      status: $Enums.TenantStatus
      version: number
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["tenant"]>
    composites: {}
  }

  type TenantGetPayload<S extends boolean | null | undefined | TenantDefaultArgs> = $Result.GetResult<Prisma.$TenantPayload, S>

  type TenantCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TenantFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TenantCountAggregateInputType | true
    }

  export interface TenantDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Tenant'], meta: { name: 'Tenant' } }
    /**
     * Find zero or one Tenant that matches the filter.
     * @param {TenantFindUniqueArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TenantFindUniqueArgs>(args: SelectSubset<T, TenantFindUniqueArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Tenant that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TenantFindUniqueOrThrowArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TenantFindUniqueOrThrowArgs>(args: SelectSubset<T, TenantFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tenant that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindFirstArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TenantFindFirstArgs>(args?: SelectSubset<T, TenantFindFirstArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tenant that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindFirstOrThrowArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TenantFindFirstOrThrowArgs>(args?: SelectSubset<T, TenantFindFirstOrThrowArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Tenants that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Tenants
     * const tenants = await prisma.tenant.findMany()
     * 
     * // Get first 10 Tenants
     * const tenants = await prisma.tenant.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tenantWithIdOnly = await prisma.tenant.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TenantFindManyArgs>(args?: SelectSubset<T, TenantFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Tenant.
     * @param {TenantCreateArgs} args - Arguments to create a Tenant.
     * @example
     * // Create one Tenant
     * const Tenant = await prisma.tenant.create({
     *   data: {
     *     // ... data to create a Tenant
     *   }
     * })
     * 
     */
    create<T extends TenantCreateArgs>(args: SelectSubset<T, TenantCreateArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Tenants.
     * @param {TenantCreateManyArgs} args - Arguments to create many Tenants.
     * @example
     * // Create many Tenants
     * const tenant = await prisma.tenant.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TenantCreateManyArgs>(args?: SelectSubset<T, TenantCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Tenants and returns the data saved in the database.
     * @param {TenantCreateManyAndReturnArgs} args - Arguments to create many Tenants.
     * @example
     * // Create many Tenants
     * const tenant = await prisma.tenant.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Tenants and only return the `id`
     * const tenantWithIdOnly = await prisma.tenant.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TenantCreateManyAndReturnArgs>(args?: SelectSubset<T, TenantCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Tenant.
     * @param {TenantDeleteArgs} args - Arguments to delete one Tenant.
     * @example
     * // Delete one Tenant
     * const Tenant = await prisma.tenant.delete({
     *   where: {
     *     // ... filter to delete one Tenant
     *   }
     * })
     * 
     */
    delete<T extends TenantDeleteArgs>(args: SelectSubset<T, TenantDeleteArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Tenant.
     * @param {TenantUpdateArgs} args - Arguments to update one Tenant.
     * @example
     * // Update one Tenant
     * const tenant = await prisma.tenant.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TenantUpdateArgs>(args: SelectSubset<T, TenantUpdateArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Tenants.
     * @param {TenantDeleteManyArgs} args - Arguments to filter Tenants to delete.
     * @example
     * // Delete a few Tenants
     * const { count } = await prisma.tenant.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TenantDeleteManyArgs>(args?: SelectSubset<T, TenantDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tenants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Tenants
     * const tenant = await prisma.tenant.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TenantUpdateManyArgs>(args: SelectSubset<T, TenantUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tenants and returns the data updated in the database.
     * @param {TenantUpdateManyAndReturnArgs} args - Arguments to update many Tenants.
     * @example
     * // Update many Tenants
     * const tenant = await prisma.tenant.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Tenants and only return the `id`
     * const tenantWithIdOnly = await prisma.tenant.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TenantUpdateManyAndReturnArgs>(args: SelectSubset<T, TenantUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Tenant.
     * @param {TenantUpsertArgs} args - Arguments to update or create a Tenant.
     * @example
     * // Update or create a Tenant
     * const tenant = await prisma.tenant.upsert({
     *   create: {
     *     // ... data to create a Tenant
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Tenant we want to update
     *   }
     * })
     */
    upsert<T extends TenantUpsertArgs>(args: SelectSubset<T, TenantUpsertArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Tenants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantCountArgs} args - Arguments to filter Tenants to count.
     * @example
     * // Count the number of Tenants
     * const count = await prisma.tenant.count({
     *   where: {
     *     // ... the filter for the Tenants we want to count
     *   }
     * })
    **/
    count<T extends TenantCountArgs>(
      args?: Subset<T, TenantCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TenantCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Tenant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TenantAggregateArgs>(args: Subset<T, TenantAggregateArgs>): Prisma.PrismaPromise<GetTenantAggregateType<T>>

    /**
     * Group by Tenant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TenantGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TenantGroupByArgs['orderBy'] }
        : { orderBy?: TenantGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TenantGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTenantGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Tenant model
   */
  readonly fields: TenantFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Tenant.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TenantClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    configurationVersions<T extends Tenant$configurationVersionsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$configurationVersionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    legalEntities<T extends Tenant$legalEntitiesArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$legalEntitiesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    businessUnits<T extends Tenant$businessUnitsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$businessUnitsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    branches<T extends Tenant$branchesArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$branchesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    factories<T extends Tenant$factoriesArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$factoriesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    users<T extends Tenant$usersArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$usersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    roles<T extends Tenant$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    roleAssignments<T extends Tenant$roleAssignmentsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$roleAssignmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    auditEvents<T extends Tenant$auditEventsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$auditEventsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    outboxEvents<T extends Tenant$outboxEventsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$outboxEventsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Tenant model
   */
  interface TenantFieldRefs {
    readonly id: FieldRef<"Tenant", 'String'>
    readonly slug: FieldRef<"Tenant", 'String'>
    readonly name: FieldRef<"Tenant", 'String'>
    readonly status: FieldRef<"Tenant", 'TenantStatus'>
    readonly version: FieldRef<"Tenant", 'Int'>
    readonly createdAt: FieldRef<"Tenant", 'DateTime'>
    readonly updatedAt: FieldRef<"Tenant", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Tenant findUnique
   */
  export type TenantFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant findUniqueOrThrow
   */
  export type TenantFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant findFirst
   */
  export type TenantFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tenants.
     */
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant findFirstOrThrow
   */
  export type TenantFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tenants.
     */
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant findMany
   */
  export type TenantFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenants to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant create
   */
  export type TenantCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The data needed to create a Tenant.
     */
    data: XOR<TenantCreateInput, TenantUncheckedCreateInput>
  }

  /**
   * Tenant createMany
   */
  export type TenantCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Tenants.
     */
    data: TenantCreateManyInput | TenantCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Tenant createManyAndReturn
   */
  export type TenantCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * The data used to create many Tenants.
     */
    data: TenantCreateManyInput | TenantCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Tenant update
   */
  export type TenantUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The data needed to update a Tenant.
     */
    data: XOR<TenantUpdateInput, TenantUncheckedUpdateInput>
    /**
     * Choose, which Tenant to update.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant updateMany
   */
  export type TenantUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Tenants.
     */
    data: XOR<TenantUpdateManyMutationInput, TenantUncheckedUpdateManyInput>
    /**
     * Filter which Tenants to update
     */
    where?: TenantWhereInput
    /**
     * Limit how many Tenants to update.
     */
    limit?: number
  }

  /**
   * Tenant updateManyAndReturn
   */
  export type TenantUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * The data used to update Tenants.
     */
    data: XOR<TenantUpdateManyMutationInput, TenantUncheckedUpdateManyInput>
    /**
     * Filter which Tenants to update
     */
    where?: TenantWhereInput
    /**
     * Limit how many Tenants to update.
     */
    limit?: number
  }

  /**
   * Tenant upsert
   */
  export type TenantUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The filter to search for the Tenant to update in case it exists.
     */
    where: TenantWhereUniqueInput
    /**
     * In case the Tenant found by the `where` argument doesn't exist, create a new Tenant with this data.
     */
    create: XOR<TenantCreateInput, TenantUncheckedCreateInput>
    /**
     * In case the Tenant was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TenantUpdateInput, TenantUncheckedUpdateInput>
  }

  /**
   * Tenant delete
   */
  export type TenantDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter which Tenant to delete.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant deleteMany
   */
  export type TenantDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tenants to delete
     */
    where?: TenantWhereInput
    /**
     * Limit how many Tenants to delete.
     */
    limit?: number
  }

  /**
   * Tenant.configurationVersions
   */
  export type Tenant$configurationVersionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    where?: TenantConfigurationVersionWhereInput
    orderBy?: TenantConfigurationVersionOrderByWithRelationInput | TenantConfigurationVersionOrderByWithRelationInput[]
    cursor?: TenantConfigurationVersionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TenantConfigurationVersionScalarFieldEnum | TenantConfigurationVersionScalarFieldEnum[]
  }

  /**
   * Tenant.legalEntities
   */
  export type Tenant$legalEntitiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    where?: LegalEntityWhereInput
    orderBy?: LegalEntityOrderByWithRelationInput | LegalEntityOrderByWithRelationInput[]
    cursor?: LegalEntityWhereUniqueInput
    take?: number
    skip?: number
    distinct?: LegalEntityScalarFieldEnum | LegalEntityScalarFieldEnum[]
  }

  /**
   * Tenant.businessUnits
   */
  export type Tenant$businessUnitsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    where?: BusinessUnitWhereInput
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    cursor?: BusinessUnitWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * Tenant.branches
   */
  export type Tenant$branchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    where?: BranchWhereInput
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    cursor?: BranchWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BranchScalarFieldEnum | BranchScalarFieldEnum[]
  }

  /**
   * Tenant.factories
   */
  export type Tenant$factoriesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    where?: FactoryWhereInput
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    cursor?: FactoryWhereUniqueInput
    take?: number
    skip?: number
    distinct?: FactoryScalarFieldEnum | FactoryScalarFieldEnum[]
  }

  /**
   * Tenant.users
   */
  export type Tenant$usersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    cursor?: UserWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * Tenant.roles
   */
  export type Tenant$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    cursor?: RoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Tenant.roleAssignments
   */
  export type Tenant$roleAssignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    where?: UserRoleAssignmentWhereInput
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    cursor?: UserRoleAssignmentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * Tenant.auditEvents
   */
  export type Tenant$auditEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    where?: AuditEventWhereInput
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    cursor?: AuditEventWhereUniqueInput
    take?: number
    skip?: number
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * Tenant.outboxEvents
   */
  export type Tenant$outboxEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    where?: OutboxEventWhereInput
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    cursor?: OutboxEventWhereUniqueInput
    take?: number
    skip?: number
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * Tenant without action
   */
  export type TenantDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
  }


  /**
   * Model TenantConfigurationVersion
   */

  export type AggregateTenantConfigurationVersion = {
    _count: TenantConfigurationVersionCountAggregateOutputType | null
    _avg: TenantConfigurationVersionAvgAggregateOutputType | null
    _sum: TenantConfigurationVersionSumAggregateOutputType | null
    _min: TenantConfigurationVersionMinAggregateOutputType | null
    _max: TenantConfigurationVersionMaxAggregateOutputType | null
  }

  export type TenantConfigurationVersionAvgAggregateOutputType = {
    version: number | null
  }

  export type TenantConfigurationVersionSumAggregateOutputType = {
    version: number | null
  }

  export type TenantConfigurationVersionMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    version: number | null
    publishedAt: Date | null
    publishedBy: string | null
  }

  export type TenantConfigurationVersionMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    version: number | null
    publishedAt: Date | null
    publishedBy: string | null
  }

  export type TenantConfigurationVersionCountAggregateOutputType = {
    id: number
    tenantId: number
    version: number
    config: number
    publishedAt: number
    publishedBy: number
    _all: number
  }


  export type TenantConfigurationVersionAvgAggregateInputType = {
    version?: true
  }

  export type TenantConfigurationVersionSumAggregateInputType = {
    version?: true
  }

  export type TenantConfigurationVersionMinAggregateInputType = {
    id?: true
    tenantId?: true
    version?: true
    publishedAt?: true
    publishedBy?: true
  }

  export type TenantConfigurationVersionMaxAggregateInputType = {
    id?: true
    tenantId?: true
    version?: true
    publishedAt?: true
    publishedBy?: true
  }

  export type TenantConfigurationVersionCountAggregateInputType = {
    id?: true
    tenantId?: true
    version?: true
    config?: true
    publishedAt?: true
    publishedBy?: true
    _all?: true
  }

  export type TenantConfigurationVersionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantConfigurationVersion to aggregate.
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantConfigurationVersions to fetch.
     */
    orderBy?: TenantConfigurationVersionOrderByWithRelationInput | TenantConfigurationVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TenantConfigurationVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantConfigurationVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantConfigurationVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TenantConfigurationVersions
    **/
    _count?: true | TenantConfigurationVersionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TenantConfigurationVersionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TenantConfigurationVersionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TenantConfigurationVersionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TenantConfigurationVersionMaxAggregateInputType
  }

  export type GetTenantConfigurationVersionAggregateType<T extends TenantConfigurationVersionAggregateArgs> = {
        [P in keyof T & keyof AggregateTenantConfigurationVersion]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTenantConfigurationVersion[P]>
      : GetScalarType<T[P], AggregateTenantConfigurationVersion[P]>
  }




  export type TenantConfigurationVersionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantConfigurationVersionWhereInput
    orderBy?: TenantConfigurationVersionOrderByWithAggregationInput | TenantConfigurationVersionOrderByWithAggregationInput[]
    by: TenantConfigurationVersionScalarFieldEnum[] | TenantConfigurationVersionScalarFieldEnum
    having?: TenantConfigurationVersionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TenantConfigurationVersionCountAggregateInputType | true
    _avg?: TenantConfigurationVersionAvgAggregateInputType
    _sum?: TenantConfigurationVersionSumAggregateInputType
    _min?: TenantConfigurationVersionMinAggregateInputType
    _max?: TenantConfigurationVersionMaxAggregateInputType
  }

  export type TenantConfigurationVersionGroupByOutputType = {
    id: string
    tenantId: string
    version: number
    config: JsonValue
    publishedAt: Date
    publishedBy: string | null
    _count: TenantConfigurationVersionCountAggregateOutputType | null
    _avg: TenantConfigurationVersionAvgAggregateOutputType | null
    _sum: TenantConfigurationVersionSumAggregateOutputType | null
    _min: TenantConfigurationVersionMinAggregateOutputType | null
    _max: TenantConfigurationVersionMaxAggregateOutputType | null
  }

  type GetTenantConfigurationVersionGroupByPayload<T extends TenantConfigurationVersionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TenantConfigurationVersionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TenantConfigurationVersionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TenantConfigurationVersionGroupByOutputType[P]>
            : GetScalarType<T[P], TenantConfigurationVersionGroupByOutputType[P]>
        }
      >
    >


  export type TenantConfigurationVersionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    version?: boolean
    config?: boolean
    publishedAt?: boolean
    publishedBy?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenantConfigurationVersion"]>

  export type TenantConfigurationVersionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    version?: boolean
    config?: boolean
    publishedAt?: boolean
    publishedBy?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenantConfigurationVersion"]>

  export type TenantConfigurationVersionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    version?: boolean
    config?: boolean
    publishedAt?: boolean
    publishedBy?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenantConfigurationVersion"]>

  export type TenantConfigurationVersionSelectScalar = {
    id?: boolean
    tenantId?: boolean
    version?: boolean
    config?: boolean
    publishedAt?: boolean
    publishedBy?: boolean
  }

  export type TenantConfigurationVersionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "version" | "config" | "publishedAt" | "publishedBy", ExtArgs["result"]["tenantConfigurationVersion"]>
  export type TenantConfigurationVersionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type TenantConfigurationVersionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type TenantConfigurationVersionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $TenantConfigurationVersionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TenantConfigurationVersion"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      version: number
      config: Prisma.JsonValue
      publishedAt: Date
      publishedBy: string | null
    }, ExtArgs["result"]["tenantConfigurationVersion"]>
    composites: {}
  }

  type TenantConfigurationVersionGetPayload<S extends boolean | null | undefined | TenantConfigurationVersionDefaultArgs> = $Result.GetResult<Prisma.$TenantConfigurationVersionPayload, S>

  type TenantConfigurationVersionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TenantConfigurationVersionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TenantConfigurationVersionCountAggregateInputType | true
    }

  export interface TenantConfigurationVersionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TenantConfigurationVersion'], meta: { name: 'TenantConfigurationVersion' } }
    /**
     * Find zero or one TenantConfigurationVersion that matches the filter.
     * @param {TenantConfigurationVersionFindUniqueArgs} args - Arguments to find a TenantConfigurationVersion
     * @example
     * // Get one TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TenantConfigurationVersionFindUniqueArgs>(args: SelectSubset<T, TenantConfigurationVersionFindUniqueArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TenantConfigurationVersion that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TenantConfigurationVersionFindUniqueOrThrowArgs} args - Arguments to find a TenantConfigurationVersion
     * @example
     * // Get one TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TenantConfigurationVersionFindUniqueOrThrowArgs>(args: SelectSubset<T, TenantConfigurationVersionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantConfigurationVersion that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionFindFirstArgs} args - Arguments to find a TenantConfigurationVersion
     * @example
     * // Get one TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TenantConfigurationVersionFindFirstArgs>(args?: SelectSubset<T, TenantConfigurationVersionFindFirstArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantConfigurationVersion that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionFindFirstOrThrowArgs} args - Arguments to find a TenantConfigurationVersion
     * @example
     * // Get one TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TenantConfigurationVersionFindFirstOrThrowArgs>(args?: SelectSubset<T, TenantConfigurationVersionFindFirstOrThrowArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TenantConfigurationVersions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TenantConfigurationVersions
     * const tenantConfigurationVersions = await prisma.tenantConfigurationVersion.findMany()
     * 
     * // Get first 10 TenantConfigurationVersions
     * const tenantConfigurationVersions = await prisma.tenantConfigurationVersion.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tenantConfigurationVersionWithIdOnly = await prisma.tenantConfigurationVersion.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TenantConfigurationVersionFindManyArgs>(args?: SelectSubset<T, TenantConfigurationVersionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TenantConfigurationVersion.
     * @param {TenantConfigurationVersionCreateArgs} args - Arguments to create a TenantConfigurationVersion.
     * @example
     * // Create one TenantConfigurationVersion
     * const TenantConfigurationVersion = await prisma.tenantConfigurationVersion.create({
     *   data: {
     *     // ... data to create a TenantConfigurationVersion
     *   }
     * })
     * 
     */
    create<T extends TenantConfigurationVersionCreateArgs>(args: SelectSubset<T, TenantConfigurationVersionCreateArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TenantConfigurationVersions.
     * @param {TenantConfigurationVersionCreateManyArgs} args - Arguments to create many TenantConfigurationVersions.
     * @example
     * // Create many TenantConfigurationVersions
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TenantConfigurationVersionCreateManyArgs>(args?: SelectSubset<T, TenantConfigurationVersionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many TenantConfigurationVersions and returns the data saved in the database.
     * @param {TenantConfigurationVersionCreateManyAndReturnArgs} args - Arguments to create many TenantConfigurationVersions.
     * @example
     * // Create many TenantConfigurationVersions
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many TenantConfigurationVersions and only return the `id`
     * const tenantConfigurationVersionWithIdOnly = await prisma.tenantConfigurationVersion.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TenantConfigurationVersionCreateManyAndReturnArgs>(args?: SelectSubset<T, TenantConfigurationVersionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a TenantConfigurationVersion.
     * @param {TenantConfigurationVersionDeleteArgs} args - Arguments to delete one TenantConfigurationVersion.
     * @example
     * // Delete one TenantConfigurationVersion
     * const TenantConfigurationVersion = await prisma.tenantConfigurationVersion.delete({
     *   where: {
     *     // ... filter to delete one TenantConfigurationVersion
     *   }
     * })
     * 
     */
    delete<T extends TenantConfigurationVersionDeleteArgs>(args: SelectSubset<T, TenantConfigurationVersionDeleteArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TenantConfigurationVersion.
     * @param {TenantConfigurationVersionUpdateArgs} args - Arguments to update one TenantConfigurationVersion.
     * @example
     * // Update one TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TenantConfigurationVersionUpdateArgs>(args: SelectSubset<T, TenantConfigurationVersionUpdateArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TenantConfigurationVersions.
     * @param {TenantConfigurationVersionDeleteManyArgs} args - Arguments to filter TenantConfigurationVersions to delete.
     * @example
     * // Delete a few TenantConfigurationVersions
     * const { count } = await prisma.tenantConfigurationVersion.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TenantConfigurationVersionDeleteManyArgs>(args?: SelectSubset<T, TenantConfigurationVersionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TenantConfigurationVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TenantConfigurationVersions
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TenantConfigurationVersionUpdateManyArgs>(args: SelectSubset<T, TenantConfigurationVersionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TenantConfigurationVersions and returns the data updated in the database.
     * @param {TenantConfigurationVersionUpdateManyAndReturnArgs} args - Arguments to update many TenantConfigurationVersions.
     * @example
     * // Update many TenantConfigurationVersions
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more TenantConfigurationVersions and only return the `id`
     * const tenantConfigurationVersionWithIdOnly = await prisma.tenantConfigurationVersion.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TenantConfigurationVersionUpdateManyAndReturnArgs>(args: SelectSubset<T, TenantConfigurationVersionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one TenantConfigurationVersion.
     * @param {TenantConfigurationVersionUpsertArgs} args - Arguments to update or create a TenantConfigurationVersion.
     * @example
     * // Update or create a TenantConfigurationVersion
     * const tenantConfigurationVersion = await prisma.tenantConfigurationVersion.upsert({
     *   create: {
     *     // ... data to create a TenantConfigurationVersion
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TenantConfigurationVersion we want to update
     *   }
     * })
     */
    upsert<T extends TenantConfigurationVersionUpsertArgs>(args: SelectSubset<T, TenantConfigurationVersionUpsertArgs<ExtArgs>>): Prisma__TenantConfigurationVersionClient<$Result.GetResult<Prisma.$TenantConfigurationVersionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TenantConfigurationVersions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionCountArgs} args - Arguments to filter TenantConfigurationVersions to count.
     * @example
     * // Count the number of TenantConfigurationVersions
     * const count = await prisma.tenantConfigurationVersion.count({
     *   where: {
     *     // ... the filter for the TenantConfigurationVersions we want to count
     *   }
     * })
    **/
    count<T extends TenantConfigurationVersionCountArgs>(
      args?: Subset<T, TenantConfigurationVersionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TenantConfigurationVersionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TenantConfigurationVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TenantConfigurationVersionAggregateArgs>(args: Subset<T, TenantConfigurationVersionAggregateArgs>): Prisma.PrismaPromise<GetTenantConfigurationVersionAggregateType<T>>

    /**
     * Group by TenantConfigurationVersion.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantConfigurationVersionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TenantConfigurationVersionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TenantConfigurationVersionGroupByArgs['orderBy'] }
        : { orderBy?: TenantConfigurationVersionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TenantConfigurationVersionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTenantConfigurationVersionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TenantConfigurationVersion model
   */
  readonly fields: TenantConfigurationVersionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TenantConfigurationVersion.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TenantConfigurationVersionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TenantConfigurationVersion model
   */
  interface TenantConfigurationVersionFieldRefs {
    readonly id: FieldRef<"TenantConfigurationVersion", 'String'>
    readonly tenantId: FieldRef<"TenantConfigurationVersion", 'String'>
    readonly version: FieldRef<"TenantConfigurationVersion", 'Int'>
    readonly config: FieldRef<"TenantConfigurationVersion", 'Json'>
    readonly publishedAt: FieldRef<"TenantConfigurationVersion", 'DateTime'>
    readonly publishedBy: FieldRef<"TenantConfigurationVersion", 'String'>
  }
    

  // Custom InputTypes
  /**
   * TenantConfigurationVersion findUnique
   */
  export type TenantConfigurationVersionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter, which TenantConfigurationVersion to fetch.
     */
    where: TenantConfigurationVersionWhereUniqueInput
  }

  /**
   * TenantConfigurationVersion findUniqueOrThrow
   */
  export type TenantConfigurationVersionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter, which TenantConfigurationVersion to fetch.
     */
    where: TenantConfigurationVersionWhereUniqueInput
  }

  /**
   * TenantConfigurationVersion findFirst
   */
  export type TenantConfigurationVersionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter, which TenantConfigurationVersion to fetch.
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantConfigurationVersions to fetch.
     */
    orderBy?: TenantConfigurationVersionOrderByWithRelationInput | TenantConfigurationVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantConfigurationVersions.
     */
    cursor?: TenantConfigurationVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantConfigurationVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantConfigurationVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantConfigurationVersions.
     */
    distinct?: TenantConfigurationVersionScalarFieldEnum | TenantConfigurationVersionScalarFieldEnum[]
  }

  /**
   * TenantConfigurationVersion findFirstOrThrow
   */
  export type TenantConfigurationVersionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter, which TenantConfigurationVersion to fetch.
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantConfigurationVersions to fetch.
     */
    orderBy?: TenantConfigurationVersionOrderByWithRelationInput | TenantConfigurationVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantConfigurationVersions.
     */
    cursor?: TenantConfigurationVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantConfigurationVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantConfigurationVersions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantConfigurationVersions.
     */
    distinct?: TenantConfigurationVersionScalarFieldEnum | TenantConfigurationVersionScalarFieldEnum[]
  }

  /**
   * TenantConfigurationVersion findMany
   */
  export type TenantConfigurationVersionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter, which TenantConfigurationVersions to fetch.
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantConfigurationVersions to fetch.
     */
    orderBy?: TenantConfigurationVersionOrderByWithRelationInput | TenantConfigurationVersionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TenantConfigurationVersions.
     */
    cursor?: TenantConfigurationVersionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantConfigurationVersions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantConfigurationVersions.
     */
    skip?: number
    distinct?: TenantConfigurationVersionScalarFieldEnum | TenantConfigurationVersionScalarFieldEnum[]
  }

  /**
   * TenantConfigurationVersion create
   */
  export type TenantConfigurationVersionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * The data needed to create a TenantConfigurationVersion.
     */
    data: XOR<TenantConfigurationVersionCreateInput, TenantConfigurationVersionUncheckedCreateInput>
  }

  /**
   * TenantConfigurationVersion createMany
   */
  export type TenantConfigurationVersionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TenantConfigurationVersions.
     */
    data: TenantConfigurationVersionCreateManyInput | TenantConfigurationVersionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TenantConfigurationVersion createManyAndReturn
   */
  export type TenantConfigurationVersionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * The data used to create many TenantConfigurationVersions.
     */
    data: TenantConfigurationVersionCreateManyInput | TenantConfigurationVersionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * TenantConfigurationVersion update
   */
  export type TenantConfigurationVersionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * The data needed to update a TenantConfigurationVersion.
     */
    data: XOR<TenantConfigurationVersionUpdateInput, TenantConfigurationVersionUncheckedUpdateInput>
    /**
     * Choose, which TenantConfigurationVersion to update.
     */
    where: TenantConfigurationVersionWhereUniqueInput
  }

  /**
   * TenantConfigurationVersion updateMany
   */
  export type TenantConfigurationVersionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TenantConfigurationVersions.
     */
    data: XOR<TenantConfigurationVersionUpdateManyMutationInput, TenantConfigurationVersionUncheckedUpdateManyInput>
    /**
     * Filter which TenantConfigurationVersions to update
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * Limit how many TenantConfigurationVersions to update.
     */
    limit?: number
  }

  /**
   * TenantConfigurationVersion updateManyAndReturn
   */
  export type TenantConfigurationVersionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * The data used to update TenantConfigurationVersions.
     */
    data: XOR<TenantConfigurationVersionUpdateManyMutationInput, TenantConfigurationVersionUncheckedUpdateManyInput>
    /**
     * Filter which TenantConfigurationVersions to update
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * Limit how many TenantConfigurationVersions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * TenantConfigurationVersion upsert
   */
  export type TenantConfigurationVersionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * The filter to search for the TenantConfigurationVersion to update in case it exists.
     */
    where: TenantConfigurationVersionWhereUniqueInput
    /**
     * In case the TenantConfigurationVersion found by the `where` argument doesn't exist, create a new TenantConfigurationVersion with this data.
     */
    create: XOR<TenantConfigurationVersionCreateInput, TenantConfigurationVersionUncheckedCreateInput>
    /**
     * In case the TenantConfigurationVersion was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TenantConfigurationVersionUpdateInput, TenantConfigurationVersionUncheckedUpdateInput>
  }

  /**
   * TenantConfigurationVersion delete
   */
  export type TenantConfigurationVersionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
    /**
     * Filter which TenantConfigurationVersion to delete.
     */
    where: TenantConfigurationVersionWhereUniqueInput
  }

  /**
   * TenantConfigurationVersion deleteMany
   */
  export type TenantConfigurationVersionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantConfigurationVersions to delete
     */
    where?: TenantConfigurationVersionWhereInput
    /**
     * Limit how many TenantConfigurationVersions to delete.
     */
    limit?: number
  }

  /**
   * TenantConfigurationVersion without action
   */
  export type TenantConfigurationVersionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantConfigurationVersion
     */
    select?: TenantConfigurationVersionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantConfigurationVersion
     */
    omit?: TenantConfigurationVersionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantConfigurationVersionInclude<ExtArgs> | null
  }


  /**
   * Model LegalEntity
   */

  export type AggregateLegalEntity = {
    _count: LegalEntityCountAggregateOutputType | null
    _min: LegalEntityMinAggregateOutputType | null
    _max: LegalEntityMaxAggregateOutputType | null
  }

  export type LegalEntityMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    code: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LegalEntityMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    code: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LegalEntityCountAggregateOutputType = {
    id: number
    tenantId: number
    name: number
    code: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type LegalEntityMinAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    code?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LegalEntityMaxAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    code?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LegalEntityCountAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    code?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type LegalEntityAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which LegalEntity to aggregate.
     */
    where?: LegalEntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LegalEntities to fetch.
     */
    orderBy?: LegalEntityOrderByWithRelationInput | LegalEntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: LegalEntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LegalEntities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LegalEntities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned LegalEntities
    **/
    _count?: true | LegalEntityCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LegalEntityMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LegalEntityMaxAggregateInputType
  }

  export type GetLegalEntityAggregateType<T extends LegalEntityAggregateArgs> = {
        [P in keyof T & keyof AggregateLegalEntity]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLegalEntity[P]>
      : GetScalarType<T[P], AggregateLegalEntity[P]>
  }




  export type LegalEntityGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LegalEntityWhereInput
    orderBy?: LegalEntityOrderByWithAggregationInput | LegalEntityOrderByWithAggregationInput[]
    by: LegalEntityScalarFieldEnum[] | LegalEntityScalarFieldEnum
    having?: LegalEntityScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LegalEntityCountAggregateInputType | true
    _min?: LegalEntityMinAggregateInputType
    _max?: LegalEntityMaxAggregateInputType
  }

  export type LegalEntityGroupByOutputType = {
    id: string
    tenantId: string
    name: string
    code: string | null
    createdAt: Date
    updatedAt: Date
    _count: LegalEntityCountAggregateOutputType | null
    _min: LegalEntityMinAggregateOutputType | null
    _max: LegalEntityMaxAggregateOutputType | null
  }

  type GetLegalEntityGroupByPayload<T extends LegalEntityGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<LegalEntityGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LegalEntityGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LegalEntityGroupByOutputType[P]>
            : GetScalarType<T[P], LegalEntityGroupByOutputType[P]>
        }
      >
    >


  export type LegalEntitySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    code?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnits?: boolean | LegalEntity$businessUnitsArgs<ExtArgs>
    _count?: boolean | LegalEntityCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["legalEntity"]>

  export type LegalEntitySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    code?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["legalEntity"]>

  export type LegalEntitySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    code?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["legalEntity"]>

  export type LegalEntitySelectScalar = {
    id?: boolean
    tenantId?: boolean
    name?: boolean
    code?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type LegalEntityOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "name" | "code" | "createdAt" | "updatedAt", ExtArgs["result"]["legalEntity"]>
  export type LegalEntityInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnits?: boolean | LegalEntity$businessUnitsArgs<ExtArgs>
    _count?: boolean | LegalEntityCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type LegalEntityIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type LegalEntityIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $LegalEntityPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "LegalEntity"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      businessUnits: Prisma.$BusinessUnitPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      name: string
      code: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["legalEntity"]>
    composites: {}
  }

  type LegalEntityGetPayload<S extends boolean | null | undefined | LegalEntityDefaultArgs> = $Result.GetResult<Prisma.$LegalEntityPayload, S>

  type LegalEntityCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<LegalEntityFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: LegalEntityCountAggregateInputType | true
    }

  export interface LegalEntityDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['LegalEntity'], meta: { name: 'LegalEntity' } }
    /**
     * Find zero or one LegalEntity that matches the filter.
     * @param {LegalEntityFindUniqueArgs} args - Arguments to find a LegalEntity
     * @example
     * // Get one LegalEntity
     * const legalEntity = await prisma.legalEntity.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LegalEntityFindUniqueArgs>(args: SelectSubset<T, LegalEntityFindUniqueArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one LegalEntity that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {LegalEntityFindUniqueOrThrowArgs} args - Arguments to find a LegalEntity
     * @example
     * // Get one LegalEntity
     * const legalEntity = await prisma.legalEntity.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LegalEntityFindUniqueOrThrowArgs>(args: SelectSubset<T, LegalEntityFindUniqueOrThrowArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first LegalEntity that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityFindFirstArgs} args - Arguments to find a LegalEntity
     * @example
     * // Get one LegalEntity
     * const legalEntity = await prisma.legalEntity.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LegalEntityFindFirstArgs>(args?: SelectSubset<T, LegalEntityFindFirstArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first LegalEntity that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityFindFirstOrThrowArgs} args - Arguments to find a LegalEntity
     * @example
     * // Get one LegalEntity
     * const legalEntity = await prisma.legalEntity.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LegalEntityFindFirstOrThrowArgs>(args?: SelectSubset<T, LegalEntityFindFirstOrThrowArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more LegalEntities that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all LegalEntities
     * const legalEntities = await prisma.legalEntity.findMany()
     * 
     * // Get first 10 LegalEntities
     * const legalEntities = await prisma.legalEntity.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const legalEntityWithIdOnly = await prisma.legalEntity.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends LegalEntityFindManyArgs>(args?: SelectSubset<T, LegalEntityFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a LegalEntity.
     * @param {LegalEntityCreateArgs} args - Arguments to create a LegalEntity.
     * @example
     * // Create one LegalEntity
     * const LegalEntity = await prisma.legalEntity.create({
     *   data: {
     *     // ... data to create a LegalEntity
     *   }
     * })
     * 
     */
    create<T extends LegalEntityCreateArgs>(args: SelectSubset<T, LegalEntityCreateArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many LegalEntities.
     * @param {LegalEntityCreateManyArgs} args - Arguments to create many LegalEntities.
     * @example
     * // Create many LegalEntities
     * const legalEntity = await prisma.legalEntity.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends LegalEntityCreateManyArgs>(args?: SelectSubset<T, LegalEntityCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many LegalEntities and returns the data saved in the database.
     * @param {LegalEntityCreateManyAndReturnArgs} args - Arguments to create many LegalEntities.
     * @example
     * // Create many LegalEntities
     * const legalEntity = await prisma.legalEntity.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many LegalEntities and only return the `id`
     * const legalEntityWithIdOnly = await prisma.legalEntity.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends LegalEntityCreateManyAndReturnArgs>(args?: SelectSubset<T, LegalEntityCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a LegalEntity.
     * @param {LegalEntityDeleteArgs} args - Arguments to delete one LegalEntity.
     * @example
     * // Delete one LegalEntity
     * const LegalEntity = await prisma.legalEntity.delete({
     *   where: {
     *     // ... filter to delete one LegalEntity
     *   }
     * })
     * 
     */
    delete<T extends LegalEntityDeleteArgs>(args: SelectSubset<T, LegalEntityDeleteArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one LegalEntity.
     * @param {LegalEntityUpdateArgs} args - Arguments to update one LegalEntity.
     * @example
     * // Update one LegalEntity
     * const legalEntity = await prisma.legalEntity.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends LegalEntityUpdateArgs>(args: SelectSubset<T, LegalEntityUpdateArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more LegalEntities.
     * @param {LegalEntityDeleteManyArgs} args - Arguments to filter LegalEntities to delete.
     * @example
     * // Delete a few LegalEntities
     * const { count } = await prisma.legalEntity.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends LegalEntityDeleteManyArgs>(args?: SelectSubset<T, LegalEntityDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more LegalEntities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many LegalEntities
     * const legalEntity = await prisma.legalEntity.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends LegalEntityUpdateManyArgs>(args: SelectSubset<T, LegalEntityUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more LegalEntities and returns the data updated in the database.
     * @param {LegalEntityUpdateManyAndReturnArgs} args - Arguments to update many LegalEntities.
     * @example
     * // Update many LegalEntities
     * const legalEntity = await prisma.legalEntity.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more LegalEntities and only return the `id`
     * const legalEntityWithIdOnly = await prisma.legalEntity.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends LegalEntityUpdateManyAndReturnArgs>(args: SelectSubset<T, LegalEntityUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one LegalEntity.
     * @param {LegalEntityUpsertArgs} args - Arguments to update or create a LegalEntity.
     * @example
     * // Update or create a LegalEntity
     * const legalEntity = await prisma.legalEntity.upsert({
     *   create: {
     *     // ... data to create a LegalEntity
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the LegalEntity we want to update
     *   }
     * })
     */
    upsert<T extends LegalEntityUpsertArgs>(args: SelectSubset<T, LegalEntityUpsertArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of LegalEntities.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityCountArgs} args - Arguments to filter LegalEntities to count.
     * @example
     * // Count the number of LegalEntities
     * const count = await prisma.legalEntity.count({
     *   where: {
     *     // ... the filter for the LegalEntities we want to count
     *   }
     * })
    **/
    count<T extends LegalEntityCountArgs>(
      args?: Subset<T, LegalEntityCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LegalEntityCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a LegalEntity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LegalEntityAggregateArgs>(args: Subset<T, LegalEntityAggregateArgs>): Prisma.PrismaPromise<GetLegalEntityAggregateType<T>>

    /**
     * Group by LegalEntity.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LegalEntityGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LegalEntityGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LegalEntityGroupByArgs['orderBy'] }
        : { orderBy?: LegalEntityGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LegalEntityGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLegalEntityGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the LegalEntity model
   */
  readonly fields: LegalEntityFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for LegalEntity.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__LegalEntityClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    businessUnits<T extends LegalEntity$businessUnitsArgs<ExtArgs> = {}>(args?: Subset<T, LegalEntity$businessUnitsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the LegalEntity model
   */
  interface LegalEntityFieldRefs {
    readonly id: FieldRef<"LegalEntity", 'String'>
    readonly tenantId: FieldRef<"LegalEntity", 'String'>
    readonly name: FieldRef<"LegalEntity", 'String'>
    readonly code: FieldRef<"LegalEntity", 'String'>
    readonly createdAt: FieldRef<"LegalEntity", 'DateTime'>
    readonly updatedAt: FieldRef<"LegalEntity", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * LegalEntity findUnique
   */
  export type LegalEntityFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter, which LegalEntity to fetch.
     */
    where: LegalEntityWhereUniqueInput
  }

  /**
   * LegalEntity findUniqueOrThrow
   */
  export type LegalEntityFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter, which LegalEntity to fetch.
     */
    where: LegalEntityWhereUniqueInput
  }

  /**
   * LegalEntity findFirst
   */
  export type LegalEntityFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter, which LegalEntity to fetch.
     */
    where?: LegalEntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LegalEntities to fetch.
     */
    orderBy?: LegalEntityOrderByWithRelationInput | LegalEntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for LegalEntities.
     */
    cursor?: LegalEntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LegalEntities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LegalEntities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of LegalEntities.
     */
    distinct?: LegalEntityScalarFieldEnum | LegalEntityScalarFieldEnum[]
  }

  /**
   * LegalEntity findFirstOrThrow
   */
  export type LegalEntityFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter, which LegalEntity to fetch.
     */
    where?: LegalEntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LegalEntities to fetch.
     */
    orderBy?: LegalEntityOrderByWithRelationInput | LegalEntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for LegalEntities.
     */
    cursor?: LegalEntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LegalEntities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LegalEntities.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of LegalEntities.
     */
    distinct?: LegalEntityScalarFieldEnum | LegalEntityScalarFieldEnum[]
  }

  /**
   * LegalEntity findMany
   */
  export type LegalEntityFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter, which LegalEntities to fetch.
     */
    where?: LegalEntityWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of LegalEntities to fetch.
     */
    orderBy?: LegalEntityOrderByWithRelationInput | LegalEntityOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing LegalEntities.
     */
    cursor?: LegalEntityWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` LegalEntities from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` LegalEntities.
     */
    skip?: number
    distinct?: LegalEntityScalarFieldEnum | LegalEntityScalarFieldEnum[]
  }

  /**
   * LegalEntity create
   */
  export type LegalEntityCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * The data needed to create a LegalEntity.
     */
    data: XOR<LegalEntityCreateInput, LegalEntityUncheckedCreateInput>
  }

  /**
   * LegalEntity createMany
   */
  export type LegalEntityCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many LegalEntities.
     */
    data: LegalEntityCreateManyInput | LegalEntityCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * LegalEntity createManyAndReturn
   */
  export type LegalEntityCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * The data used to create many LegalEntities.
     */
    data: LegalEntityCreateManyInput | LegalEntityCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * LegalEntity update
   */
  export type LegalEntityUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * The data needed to update a LegalEntity.
     */
    data: XOR<LegalEntityUpdateInput, LegalEntityUncheckedUpdateInput>
    /**
     * Choose, which LegalEntity to update.
     */
    where: LegalEntityWhereUniqueInput
  }

  /**
   * LegalEntity updateMany
   */
  export type LegalEntityUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update LegalEntities.
     */
    data: XOR<LegalEntityUpdateManyMutationInput, LegalEntityUncheckedUpdateManyInput>
    /**
     * Filter which LegalEntities to update
     */
    where?: LegalEntityWhereInput
    /**
     * Limit how many LegalEntities to update.
     */
    limit?: number
  }

  /**
   * LegalEntity updateManyAndReturn
   */
  export type LegalEntityUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * The data used to update LegalEntities.
     */
    data: XOR<LegalEntityUpdateManyMutationInput, LegalEntityUncheckedUpdateManyInput>
    /**
     * Filter which LegalEntities to update
     */
    where?: LegalEntityWhereInput
    /**
     * Limit how many LegalEntities to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * LegalEntity upsert
   */
  export type LegalEntityUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * The filter to search for the LegalEntity to update in case it exists.
     */
    where: LegalEntityWhereUniqueInput
    /**
     * In case the LegalEntity found by the `where` argument doesn't exist, create a new LegalEntity with this data.
     */
    create: XOR<LegalEntityCreateInput, LegalEntityUncheckedCreateInput>
    /**
     * In case the LegalEntity was found with the provided `where` argument, update it with this data.
     */
    update: XOR<LegalEntityUpdateInput, LegalEntityUncheckedUpdateInput>
  }

  /**
   * LegalEntity delete
   */
  export type LegalEntityDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
    /**
     * Filter which LegalEntity to delete.
     */
    where: LegalEntityWhereUniqueInput
  }

  /**
   * LegalEntity deleteMany
   */
  export type LegalEntityDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which LegalEntities to delete
     */
    where?: LegalEntityWhereInput
    /**
     * Limit how many LegalEntities to delete.
     */
    limit?: number
  }

  /**
   * LegalEntity.businessUnits
   */
  export type LegalEntity$businessUnitsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    where?: BusinessUnitWhereInput
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    cursor?: BusinessUnitWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * LegalEntity without action
   */
  export type LegalEntityDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LegalEntity
     */
    select?: LegalEntitySelect<ExtArgs> | null
    /**
     * Omit specific fields from the LegalEntity
     */
    omit?: LegalEntityOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LegalEntityInclude<ExtArgs> | null
  }


  /**
   * Model BusinessUnit
   */

  export type AggregateBusinessUnit = {
    _count: BusinessUnitCountAggregateOutputType | null
    _min: BusinessUnitMinAggregateOutputType | null
    _max: BusinessUnitMaxAggregateOutputType | null
  }

  export type BusinessUnitMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    legalEntityId: string | null
    parentId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BusinessUnitMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    legalEntityId: string | null
    parentId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BusinessUnitCountAggregateOutputType = {
    id: number
    tenantId: number
    legalEntityId: number
    parentId: number
    name: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type BusinessUnitMinAggregateInputType = {
    id?: true
    tenantId?: true
    legalEntityId?: true
    parentId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BusinessUnitMaxAggregateInputType = {
    id?: true
    tenantId?: true
    legalEntityId?: true
    parentId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BusinessUnitCountAggregateInputType = {
    id?: true
    tenantId?: true
    legalEntityId?: true
    parentId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type BusinessUnitAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BusinessUnit to aggregate.
     */
    where?: BusinessUnitWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BusinessUnits to fetch.
     */
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BusinessUnitWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BusinessUnits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BusinessUnits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned BusinessUnits
    **/
    _count?: true | BusinessUnitCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BusinessUnitMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BusinessUnitMaxAggregateInputType
  }

  export type GetBusinessUnitAggregateType<T extends BusinessUnitAggregateArgs> = {
        [P in keyof T & keyof AggregateBusinessUnit]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBusinessUnit[P]>
      : GetScalarType<T[P], AggregateBusinessUnit[P]>
  }




  export type BusinessUnitGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BusinessUnitWhereInput
    orderBy?: BusinessUnitOrderByWithAggregationInput | BusinessUnitOrderByWithAggregationInput[]
    by: BusinessUnitScalarFieldEnum[] | BusinessUnitScalarFieldEnum
    having?: BusinessUnitScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BusinessUnitCountAggregateInputType | true
    _min?: BusinessUnitMinAggregateInputType
    _max?: BusinessUnitMaxAggregateInputType
  }

  export type BusinessUnitGroupByOutputType = {
    id: string
    tenantId: string
    legalEntityId: string
    parentId: string | null
    name: string
    createdAt: Date
    updatedAt: Date
    _count: BusinessUnitCountAggregateOutputType | null
    _min: BusinessUnitMinAggregateOutputType | null
    _max: BusinessUnitMaxAggregateOutputType | null
  }

  type GetBusinessUnitGroupByPayload<T extends BusinessUnitGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BusinessUnitGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BusinessUnitGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BusinessUnitGroupByOutputType[P]>
            : GetScalarType<T[P], BusinessUnitGroupByOutputType[P]>
        }
      >
    >


  export type BusinessUnitSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    legalEntityId?: boolean
    parentId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
    children?: boolean | BusinessUnit$childrenArgs<ExtArgs>
    branches?: boolean | BusinessUnit$branchesArgs<ExtArgs>
    factories?: boolean | BusinessUnit$factoriesArgs<ExtArgs>
    _count?: boolean | BusinessUnitCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["businessUnit"]>

  export type BusinessUnitSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    legalEntityId?: boolean
    parentId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
  }, ExtArgs["result"]["businessUnit"]>

  export type BusinessUnitSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    legalEntityId?: boolean
    parentId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
  }, ExtArgs["result"]["businessUnit"]>

  export type BusinessUnitSelectScalar = {
    id?: boolean
    tenantId?: boolean
    legalEntityId?: boolean
    parentId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type BusinessUnitOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "legalEntityId" | "parentId" | "name" | "createdAt" | "updatedAt", ExtArgs["result"]["businessUnit"]>
  export type BusinessUnitInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
    children?: boolean | BusinessUnit$childrenArgs<ExtArgs>
    branches?: boolean | BusinessUnit$branchesArgs<ExtArgs>
    factories?: boolean | BusinessUnit$factoriesArgs<ExtArgs>
    _count?: boolean | BusinessUnitCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type BusinessUnitIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
  }
  export type BusinessUnitIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    legalEntity?: boolean | LegalEntityDefaultArgs<ExtArgs>
    parent?: boolean | BusinessUnit$parentArgs<ExtArgs>
  }

  export type $BusinessUnitPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "BusinessUnit"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      legalEntity: Prisma.$LegalEntityPayload<ExtArgs>
      parent: Prisma.$BusinessUnitPayload<ExtArgs> | null
      children: Prisma.$BusinessUnitPayload<ExtArgs>[]
      branches: Prisma.$BranchPayload<ExtArgs>[]
      factories: Prisma.$FactoryPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      legalEntityId: string
      parentId: string | null
      name: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["businessUnit"]>
    composites: {}
  }

  type BusinessUnitGetPayload<S extends boolean | null | undefined | BusinessUnitDefaultArgs> = $Result.GetResult<Prisma.$BusinessUnitPayload, S>

  type BusinessUnitCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BusinessUnitFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BusinessUnitCountAggregateInputType | true
    }

  export interface BusinessUnitDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['BusinessUnit'], meta: { name: 'BusinessUnit' } }
    /**
     * Find zero or one BusinessUnit that matches the filter.
     * @param {BusinessUnitFindUniqueArgs} args - Arguments to find a BusinessUnit
     * @example
     * // Get one BusinessUnit
     * const businessUnit = await prisma.businessUnit.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BusinessUnitFindUniqueArgs>(args: SelectSubset<T, BusinessUnitFindUniqueArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one BusinessUnit that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BusinessUnitFindUniqueOrThrowArgs} args - Arguments to find a BusinessUnit
     * @example
     * // Get one BusinessUnit
     * const businessUnit = await prisma.businessUnit.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BusinessUnitFindUniqueOrThrowArgs>(args: SelectSubset<T, BusinessUnitFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BusinessUnit that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitFindFirstArgs} args - Arguments to find a BusinessUnit
     * @example
     * // Get one BusinessUnit
     * const businessUnit = await prisma.businessUnit.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BusinessUnitFindFirstArgs>(args?: SelectSubset<T, BusinessUnitFindFirstArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BusinessUnit that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitFindFirstOrThrowArgs} args - Arguments to find a BusinessUnit
     * @example
     * // Get one BusinessUnit
     * const businessUnit = await prisma.businessUnit.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BusinessUnitFindFirstOrThrowArgs>(args?: SelectSubset<T, BusinessUnitFindFirstOrThrowArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more BusinessUnits that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BusinessUnits
     * const businessUnits = await prisma.businessUnit.findMany()
     * 
     * // Get first 10 BusinessUnits
     * const businessUnits = await prisma.businessUnit.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const businessUnitWithIdOnly = await prisma.businessUnit.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BusinessUnitFindManyArgs>(args?: SelectSubset<T, BusinessUnitFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a BusinessUnit.
     * @param {BusinessUnitCreateArgs} args - Arguments to create a BusinessUnit.
     * @example
     * // Create one BusinessUnit
     * const BusinessUnit = await prisma.businessUnit.create({
     *   data: {
     *     // ... data to create a BusinessUnit
     *   }
     * })
     * 
     */
    create<T extends BusinessUnitCreateArgs>(args: SelectSubset<T, BusinessUnitCreateArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many BusinessUnits.
     * @param {BusinessUnitCreateManyArgs} args - Arguments to create many BusinessUnits.
     * @example
     * // Create many BusinessUnits
     * const businessUnit = await prisma.businessUnit.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BusinessUnitCreateManyArgs>(args?: SelectSubset<T, BusinessUnitCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many BusinessUnits and returns the data saved in the database.
     * @param {BusinessUnitCreateManyAndReturnArgs} args - Arguments to create many BusinessUnits.
     * @example
     * // Create many BusinessUnits
     * const businessUnit = await prisma.businessUnit.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many BusinessUnits and only return the `id`
     * const businessUnitWithIdOnly = await prisma.businessUnit.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BusinessUnitCreateManyAndReturnArgs>(args?: SelectSubset<T, BusinessUnitCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a BusinessUnit.
     * @param {BusinessUnitDeleteArgs} args - Arguments to delete one BusinessUnit.
     * @example
     * // Delete one BusinessUnit
     * const BusinessUnit = await prisma.businessUnit.delete({
     *   where: {
     *     // ... filter to delete one BusinessUnit
     *   }
     * })
     * 
     */
    delete<T extends BusinessUnitDeleteArgs>(args: SelectSubset<T, BusinessUnitDeleteArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one BusinessUnit.
     * @param {BusinessUnitUpdateArgs} args - Arguments to update one BusinessUnit.
     * @example
     * // Update one BusinessUnit
     * const businessUnit = await prisma.businessUnit.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BusinessUnitUpdateArgs>(args: SelectSubset<T, BusinessUnitUpdateArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more BusinessUnits.
     * @param {BusinessUnitDeleteManyArgs} args - Arguments to filter BusinessUnits to delete.
     * @example
     * // Delete a few BusinessUnits
     * const { count } = await prisma.businessUnit.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BusinessUnitDeleteManyArgs>(args?: SelectSubset<T, BusinessUnitDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BusinessUnits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BusinessUnits
     * const businessUnit = await prisma.businessUnit.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BusinessUnitUpdateManyArgs>(args: SelectSubset<T, BusinessUnitUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BusinessUnits and returns the data updated in the database.
     * @param {BusinessUnitUpdateManyAndReturnArgs} args - Arguments to update many BusinessUnits.
     * @example
     * // Update many BusinessUnits
     * const businessUnit = await prisma.businessUnit.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more BusinessUnits and only return the `id`
     * const businessUnitWithIdOnly = await prisma.businessUnit.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BusinessUnitUpdateManyAndReturnArgs>(args: SelectSubset<T, BusinessUnitUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one BusinessUnit.
     * @param {BusinessUnitUpsertArgs} args - Arguments to update or create a BusinessUnit.
     * @example
     * // Update or create a BusinessUnit
     * const businessUnit = await prisma.businessUnit.upsert({
     *   create: {
     *     // ... data to create a BusinessUnit
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BusinessUnit we want to update
     *   }
     * })
     */
    upsert<T extends BusinessUnitUpsertArgs>(args: SelectSubset<T, BusinessUnitUpsertArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of BusinessUnits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitCountArgs} args - Arguments to filter BusinessUnits to count.
     * @example
     * // Count the number of BusinessUnits
     * const count = await prisma.businessUnit.count({
     *   where: {
     *     // ... the filter for the BusinessUnits we want to count
     *   }
     * })
    **/
    count<T extends BusinessUnitCountArgs>(
      args?: Subset<T, BusinessUnitCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BusinessUnitCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a BusinessUnit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BusinessUnitAggregateArgs>(args: Subset<T, BusinessUnitAggregateArgs>): Prisma.PrismaPromise<GetBusinessUnitAggregateType<T>>

    /**
     * Group by BusinessUnit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BusinessUnitGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BusinessUnitGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BusinessUnitGroupByArgs['orderBy'] }
        : { orderBy?: BusinessUnitGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BusinessUnitGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBusinessUnitGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the BusinessUnit model
   */
  readonly fields: BusinessUnitFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for BusinessUnit.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BusinessUnitClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    legalEntity<T extends LegalEntityDefaultArgs<ExtArgs> = {}>(args?: Subset<T, LegalEntityDefaultArgs<ExtArgs>>): Prisma__LegalEntityClient<$Result.GetResult<Prisma.$LegalEntityPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    parent<T extends BusinessUnit$parentArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnit$parentArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    children<T extends BusinessUnit$childrenArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnit$childrenArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    branches<T extends BusinessUnit$branchesArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnit$branchesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    factories<T extends BusinessUnit$factoriesArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnit$factoriesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the BusinessUnit model
   */
  interface BusinessUnitFieldRefs {
    readonly id: FieldRef<"BusinessUnit", 'String'>
    readonly tenantId: FieldRef<"BusinessUnit", 'String'>
    readonly legalEntityId: FieldRef<"BusinessUnit", 'String'>
    readonly parentId: FieldRef<"BusinessUnit", 'String'>
    readonly name: FieldRef<"BusinessUnit", 'String'>
    readonly createdAt: FieldRef<"BusinessUnit", 'DateTime'>
    readonly updatedAt: FieldRef<"BusinessUnit", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * BusinessUnit findUnique
   */
  export type BusinessUnitFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter, which BusinessUnit to fetch.
     */
    where: BusinessUnitWhereUniqueInput
  }

  /**
   * BusinessUnit findUniqueOrThrow
   */
  export type BusinessUnitFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter, which BusinessUnit to fetch.
     */
    where: BusinessUnitWhereUniqueInput
  }

  /**
   * BusinessUnit findFirst
   */
  export type BusinessUnitFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter, which BusinessUnit to fetch.
     */
    where?: BusinessUnitWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BusinessUnits to fetch.
     */
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BusinessUnits.
     */
    cursor?: BusinessUnitWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BusinessUnits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BusinessUnits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BusinessUnits.
     */
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * BusinessUnit findFirstOrThrow
   */
  export type BusinessUnitFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter, which BusinessUnit to fetch.
     */
    where?: BusinessUnitWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BusinessUnits to fetch.
     */
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BusinessUnits.
     */
    cursor?: BusinessUnitWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BusinessUnits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BusinessUnits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BusinessUnits.
     */
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * BusinessUnit findMany
   */
  export type BusinessUnitFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter, which BusinessUnits to fetch.
     */
    where?: BusinessUnitWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BusinessUnits to fetch.
     */
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing BusinessUnits.
     */
    cursor?: BusinessUnitWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BusinessUnits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BusinessUnits.
     */
    skip?: number
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * BusinessUnit create
   */
  export type BusinessUnitCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * The data needed to create a BusinessUnit.
     */
    data: XOR<BusinessUnitCreateInput, BusinessUnitUncheckedCreateInput>
  }

  /**
   * BusinessUnit createMany
   */
  export type BusinessUnitCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many BusinessUnits.
     */
    data: BusinessUnitCreateManyInput | BusinessUnitCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * BusinessUnit createManyAndReturn
   */
  export type BusinessUnitCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * The data used to create many BusinessUnits.
     */
    data: BusinessUnitCreateManyInput | BusinessUnitCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * BusinessUnit update
   */
  export type BusinessUnitUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * The data needed to update a BusinessUnit.
     */
    data: XOR<BusinessUnitUpdateInput, BusinessUnitUncheckedUpdateInput>
    /**
     * Choose, which BusinessUnit to update.
     */
    where: BusinessUnitWhereUniqueInput
  }

  /**
   * BusinessUnit updateMany
   */
  export type BusinessUnitUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update BusinessUnits.
     */
    data: XOR<BusinessUnitUpdateManyMutationInput, BusinessUnitUncheckedUpdateManyInput>
    /**
     * Filter which BusinessUnits to update
     */
    where?: BusinessUnitWhereInput
    /**
     * Limit how many BusinessUnits to update.
     */
    limit?: number
  }

  /**
   * BusinessUnit updateManyAndReturn
   */
  export type BusinessUnitUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * The data used to update BusinessUnits.
     */
    data: XOR<BusinessUnitUpdateManyMutationInput, BusinessUnitUncheckedUpdateManyInput>
    /**
     * Filter which BusinessUnits to update
     */
    where?: BusinessUnitWhereInput
    /**
     * Limit how many BusinessUnits to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * BusinessUnit upsert
   */
  export type BusinessUnitUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * The filter to search for the BusinessUnit to update in case it exists.
     */
    where: BusinessUnitWhereUniqueInput
    /**
     * In case the BusinessUnit found by the `where` argument doesn't exist, create a new BusinessUnit with this data.
     */
    create: XOR<BusinessUnitCreateInput, BusinessUnitUncheckedCreateInput>
    /**
     * In case the BusinessUnit was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BusinessUnitUpdateInput, BusinessUnitUncheckedUpdateInput>
  }

  /**
   * BusinessUnit delete
   */
  export type BusinessUnitDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    /**
     * Filter which BusinessUnit to delete.
     */
    where: BusinessUnitWhereUniqueInput
  }

  /**
   * BusinessUnit deleteMany
   */
  export type BusinessUnitDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BusinessUnits to delete
     */
    where?: BusinessUnitWhereInput
    /**
     * Limit how many BusinessUnits to delete.
     */
    limit?: number
  }

  /**
   * BusinessUnit.parent
   */
  export type BusinessUnit$parentArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    where?: BusinessUnitWhereInput
  }

  /**
   * BusinessUnit.children
   */
  export type BusinessUnit$childrenArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
    where?: BusinessUnitWhereInput
    orderBy?: BusinessUnitOrderByWithRelationInput | BusinessUnitOrderByWithRelationInput[]
    cursor?: BusinessUnitWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BusinessUnitScalarFieldEnum | BusinessUnitScalarFieldEnum[]
  }

  /**
   * BusinessUnit.branches
   */
  export type BusinessUnit$branchesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    where?: BranchWhereInput
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    cursor?: BranchWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BranchScalarFieldEnum | BranchScalarFieldEnum[]
  }

  /**
   * BusinessUnit.factories
   */
  export type BusinessUnit$factoriesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    where?: FactoryWhereInput
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    cursor?: FactoryWhereUniqueInput
    take?: number
    skip?: number
    distinct?: FactoryScalarFieldEnum | FactoryScalarFieldEnum[]
  }

  /**
   * BusinessUnit without action
   */
  export type BusinessUnitDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BusinessUnit
     */
    select?: BusinessUnitSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BusinessUnit
     */
    omit?: BusinessUnitOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BusinessUnitInclude<ExtArgs> | null
  }


  /**
   * Model Branch
   */

  export type AggregateBranch = {
    _count: BranchCountAggregateOutputType | null
    _min: BranchMinAggregateOutputType | null
    _max: BranchMaxAggregateOutputType | null
  }

  export type BranchMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    businessUnitId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BranchMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    businessUnitId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BranchCountAggregateOutputType = {
    id: number
    tenantId: number
    businessUnitId: number
    name: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type BranchMinAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BranchMaxAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BranchCountAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type BranchAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Branch to aggregate.
     */
    where?: BranchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Branches to fetch.
     */
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BranchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Branches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Branches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Branches
    **/
    _count?: true | BranchCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BranchMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BranchMaxAggregateInputType
  }

  export type GetBranchAggregateType<T extends BranchAggregateArgs> = {
        [P in keyof T & keyof AggregateBranch]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBranch[P]>
      : GetScalarType<T[P], AggregateBranch[P]>
  }




  export type BranchGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BranchWhereInput
    orderBy?: BranchOrderByWithAggregationInput | BranchOrderByWithAggregationInput[]
    by: BranchScalarFieldEnum[] | BranchScalarFieldEnum
    having?: BranchScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BranchCountAggregateInputType | true
    _min?: BranchMinAggregateInputType
    _max?: BranchMaxAggregateInputType
  }

  export type BranchGroupByOutputType = {
    id: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt: Date
    updatedAt: Date
    _count: BranchCountAggregateOutputType | null
    _min: BranchMinAggregateOutputType | null
    _max: BranchMaxAggregateOutputType | null
  }

  type GetBranchGroupByPayload<T extends BranchGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BranchGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BranchGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BranchGroupByOutputType[P]>
            : GetScalarType<T[P], BranchGroupByOutputType[P]>
        }
      >
    >


  export type BranchSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["branch"]>

  export type BranchSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["branch"]>

  export type BranchSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["branch"]>

  export type BranchSelectScalar = {
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type BranchOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "businessUnitId" | "name" | "createdAt" | "updatedAt", ExtArgs["result"]["branch"]>
  export type BranchInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }
  export type BranchIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }
  export type BranchIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }

  export type $BranchPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Branch"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      businessUnit: Prisma.$BusinessUnitPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      businessUnitId: string
      name: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["branch"]>
    composites: {}
  }

  type BranchGetPayload<S extends boolean | null | undefined | BranchDefaultArgs> = $Result.GetResult<Prisma.$BranchPayload, S>

  type BranchCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BranchFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BranchCountAggregateInputType | true
    }

  export interface BranchDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Branch'], meta: { name: 'Branch' } }
    /**
     * Find zero or one Branch that matches the filter.
     * @param {BranchFindUniqueArgs} args - Arguments to find a Branch
     * @example
     * // Get one Branch
     * const branch = await prisma.branch.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BranchFindUniqueArgs>(args: SelectSubset<T, BranchFindUniqueArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Branch that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BranchFindUniqueOrThrowArgs} args - Arguments to find a Branch
     * @example
     * // Get one Branch
     * const branch = await prisma.branch.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BranchFindUniqueOrThrowArgs>(args: SelectSubset<T, BranchFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Branch that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchFindFirstArgs} args - Arguments to find a Branch
     * @example
     * // Get one Branch
     * const branch = await prisma.branch.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BranchFindFirstArgs>(args?: SelectSubset<T, BranchFindFirstArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Branch that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchFindFirstOrThrowArgs} args - Arguments to find a Branch
     * @example
     * // Get one Branch
     * const branch = await prisma.branch.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BranchFindFirstOrThrowArgs>(args?: SelectSubset<T, BranchFindFirstOrThrowArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Branches that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Branches
     * const branches = await prisma.branch.findMany()
     * 
     * // Get first 10 Branches
     * const branches = await prisma.branch.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const branchWithIdOnly = await prisma.branch.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BranchFindManyArgs>(args?: SelectSubset<T, BranchFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Branch.
     * @param {BranchCreateArgs} args - Arguments to create a Branch.
     * @example
     * // Create one Branch
     * const Branch = await prisma.branch.create({
     *   data: {
     *     // ... data to create a Branch
     *   }
     * })
     * 
     */
    create<T extends BranchCreateArgs>(args: SelectSubset<T, BranchCreateArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Branches.
     * @param {BranchCreateManyArgs} args - Arguments to create many Branches.
     * @example
     * // Create many Branches
     * const branch = await prisma.branch.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BranchCreateManyArgs>(args?: SelectSubset<T, BranchCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Branches and returns the data saved in the database.
     * @param {BranchCreateManyAndReturnArgs} args - Arguments to create many Branches.
     * @example
     * // Create many Branches
     * const branch = await prisma.branch.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Branches and only return the `id`
     * const branchWithIdOnly = await prisma.branch.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BranchCreateManyAndReturnArgs>(args?: SelectSubset<T, BranchCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Branch.
     * @param {BranchDeleteArgs} args - Arguments to delete one Branch.
     * @example
     * // Delete one Branch
     * const Branch = await prisma.branch.delete({
     *   where: {
     *     // ... filter to delete one Branch
     *   }
     * })
     * 
     */
    delete<T extends BranchDeleteArgs>(args: SelectSubset<T, BranchDeleteArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Branch.
     * @param {BranchUpdateArgs} args - Arguments to update one Branch.
     * @example
     * // Update one Branch
     * const branch = await prisma.branch.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BranchUpdateArgs>(args: SelectSubset<T, BranchUpdateArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Branches.
     * @param {BranchDeleteManyArgs} args - Arguments to filter Branches to delete.
     * @example
     * // Delete a few Branches
     * const { count } = await prisma.branch.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BranchDeleteManyArgs>(args?: SelectSubset<T, BranchDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Branches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Branches
     * const branch = await prisma.branch.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BranchUpdateManyArgs>(args: SelectSubset<T, BranchUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Branches and returns the data updated in the database.
     * @param {BranchUpdateManyAndReturnArgs} args - Arguments to update many Branches.
     * @example
     * // Update many Branches
     * const branch = await prisma.branch.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Branches and only return the `id`
     * const branchWithIdOnly = await prisma.branch.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BranchUpdateManyAndReturnArgs>(args: SelectSubset<T, BranchUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Branch.
     * @param {BranchUpsertArgs} args - Arguments to update or create a Branch.
     * @example
     * // Update or create a Branch
     * const branch = await prisma.branch.upsert({
     *   create: {
     *     // ... data to create a Branch
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Branch we want to update
     *   }
     * })
     */
    upsert<T extends BranchUpsertArgs>(args: SelectSubset<T, BranchUpsertArgs<ExtArgs>>): Prisma__BranchClient<$Result.GetResult<Prisma.$BranchPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Branches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchCountArgs} args - Arguments to filter Branches to count.
     * @example
     * // Count the number of Branches
     * const count = await prisma.branch.count({
     *   where: {
     *     // ... the filter for the Branches we want to count
     *   }
     * })
    **/
    count<T extends BranchCountArgs>(
      args?: Subset<T, BranchCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BranchCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Branch.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BranchAggregateArgs>(args: Subset<T, BranchAggregateArgs>): Prisma.PrismaPromise<GetBranchAggregateType<T>>

    /**
     * Group by Branch.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BranchGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BranchGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BranchGroupByArgs['orderBy'] }
        : { orderBy?: BranchGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BranchGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBranchGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Branch model
   */
  readonly fields: BranchFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Branch.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BranchClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    businessUnit<T extends BusinessUnitDefaultArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnitDefaultArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Branch model
   */
  interface BranchFieldRefs {
    readonly id: FieldRef<"Branch", 'String'>
    readonly tenantId: FieldRef<"Branch", 'String'>
    readonly businessUnitId: FieldRef<"Branch", 'String'>
    readonly name: FieldRef<"Branch", 'String'>
    readonly createdAt: FieldRef<"Branch", 'DateTime'>
    readonly updatedAt: FieldRef<"Branch", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Branch findUnique
   */
  export type BranchFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter, which Branch to fetch.
     */
    where: BranchWhereUniqueInput
  }

  /**
   * Branch findUniqueOrThrow
   */
  export type BranchFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter, which Branch to fetch.
     */
    where: BranchWhereUniqueInput
  }

  /**
   * Branch findFirst
   */
  export type BranchFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter, which Branch to fetch.
     */
    where?: BranchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Branches to fetch.
     */
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Branches.
     */
    cursor?: BranchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Branches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Branches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Branches.
     */
    distinct?: BranchScalarFieldEnum | BranchScalarFieldEnum[]
  }

  /**
   * Branch findFirstOrThrow
   */
  export type BranchFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter, which Branch to fetch.
     */
    where?: BranchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Branches to fetch.
     */
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Branches.
     */
    cursor?: BranchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Branches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Branches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Branches.
     */
    distinct?: BranchScalarFieldEnum | BranchScalarFieldEnum[]
  }

  /**
   * Branch findMany
   */
  export type BranchFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter, which Branches to fetch.
     */
    where?: BranchWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Branches to fetch.
     */
    orderBy?: BranchOrderByWithRelationInput | BranchOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Branches.
     */
    cursor?: BranchWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Branches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Branches.
     */
    skip?: number
    distinct?: BranchScalarFieldEnum | BranchScalarFieldEnum[]
  }

  /**
   * Branch create
   */
  export type BranchCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * The data needed to create a Branch.
     */
    data: XOR<BranchCreateInput, BranchUncheckedCreateInput>
  }

  /**
   * Branch createMany
   */
  export type BranchCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Branches.
     */
    data: BranchCreateManyInput | BranchCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Branch createManyAndReturn
   */
  export type BranchCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * The data used to create many Branches.
     */
    data: BranchCreateManyInput | BranchCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Branch update
   */
  export type BranchUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * The data needed to update a Branch.
     */
    data: XOR<BranchUpdateInput, BranchUncheckedUpdateInput>
    /**
     * Choose, which Branch to update.
     */
    where: BranchWhereUniqueInput
  }

  /**
   * Branch updateMany
   */
  export type BranchUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Branches.
     */
    data: XOR<BranchUpdateManyMutationInput, BranchUncheckedUpdateManyInput>
    /**
     * Filter which Branches to update
     */
    where?: BranchWhereInput
    /**
     * Limit how many Branches to update.
     */
    limit?: number
  }

  /**
   * Branch updateManyAndReturn
   */
  export type BranchUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * The data used to update Branches.
     */
    data: XOR<BranchUpdateManyMutationInput, BranchUncheckedUpdateManyInput>
    /**
     * Filter which Branches to update
     */
    where?: BranchWhereInput
    /**
     * Limit how many Branches to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Branch upsert
   */
  export type BranchUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * The filter to search for the Branch to update in case it exists.
     */
    where: BranchWhereUniqueInput
    /**
     * In case the Branch found by the `where` argument doesn't exist, create a new Branch with this data.
     */
    create: XOR<BranchCreateInput, BranchUncheckedCreateInput>
    /**
     * In case the Branch was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BranchUpdateInput, BranchUncheckedUpdateInput>
  }

  /**
   * Branch delete
   */
  export type BranchDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
    /**
     * Filter which Branch to delete.
     */
    where: BranchWhereUniqueInput
  }

  /**
   * Branch deleteMany
   */
  export type BranchDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Branches to delete
     */
    where?: BranchWhereInput
    /**
     * Limit how many Branches to delete.
     */
    limit?: number
  }

  /**
   * Branch without action
   */
  export type BranchDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Branch
     */
    select?: BranchSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Branch
     */
    omit?: BranchOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BranchInclude<ExtArgs> | null
  }


  /**
   * Model Factory
   */

  export type AggregateFactory = {
    _count: FactoryCountAggregateOutputType | null
    _min: FactoryMinAggregateOutputType | null
    _max: FactoryMaxAggregateOutputType | null
  }

  export type FactoryMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    businessUnitId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type FactoryMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    businessUnitId: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type FactoryCountAggregateOutputType = {
    id: number
    tenantId: number
    businessUnitId: number
    name: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type FactoryMinAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type FactoryMaxAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
  }

  export type FactoryCountAggregateInputType = {
    id?: true
    tenantId?: true
    businessUnitId?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type FactoryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Factory to aggregate.
     */
    where?: FactoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Factories to fetch.
     */
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: FactoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Factories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Factories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Factories
    **/
    _count?: true | FactoryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: FactoryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: FactoryMaxAggregateInputType
  }

  export type GetFactoryAggregateType<T extends FactoryAggregateArgs> = {
        [P in keyof T & keyof AggregateFactory]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateFactory[P]>
      : GetScalarType<T[P], AggregateFactory[P]>
  }




  export type FactoryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: FactoryWhereInput
    orderBy?: FactoryOrderByWithAggregationInput | FactoryOrderByWithAggregationInput[]
    by: FactoryScalarFieldEnum[] | FactoryScalarFieldEnum
    having?: FactoryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: FactoryCountAggregateInputType | true
    _min?: FactoryMinAggregateInputType
    _max?: FactoryMaxAggregateInputType
  }

  export type FactoryGroupByOutputType = {
    id: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt: Date
    updatedAt: Date
    _count: FactoryCountAggregateOutputType | null
    _min: FactoryMinAggregateOutputType | null
    _max: FactoryMaxAggregateOutputType | null
  }

  type GetFactoryGroupByPayload<T extends FactoryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<FactoryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof FactoryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], FactoryGroupByOutputType[P]>
            : GetScalarType<T[P], FactoryGroupByOutputType[P]>
        }
      >
    >


  export type FactorySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["factory"]>

  export type FactorySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["factory"]>

  export type FactorySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["factory"]>

  export type FactorySelectScalar = {
    id?: boolean
    tenantId?: boolean
    businessUnitId?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type FactoryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "businessUnitId" | "name" | "createdAt" | "updatedAt", ExtArgs["result"]["factory"]>
  export type FactoryInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }
  export type FactoryIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }
  export type FactoryIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    businessUnit?: boolean | BusinessUnitDefaultArgs<ExtArgs>
  }

  export type $FactoryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Factory"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      businessUnit: Prisma.$BusinessUnitPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      businessUnitId: string
      name: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["factory"]>
    composites: {}
  }

  type FactoryGetPayload<S extends boolean | null | undefined | FactoryDefaultArgs> = $Result.GetResult<Prisma.$FactoryPayload, S>

  type FactoryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<FactoryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: FactoryCountAggregateInputType | true
    }

  export interface FactoryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Factory'], meta: { name: 'Factory' } }
    /**
     * Find zero or one Factory that matches the filter.
     * @param {FactoryFindUniqueArgs} args - Arguments to find a Factory
     * @example
     * // Get one Factory
     * const factory = await prisma.factory.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends FactoryFindUniqueArgs>(args: SelectSubset<T, FactoryFindUniqueArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Factory that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {FactoryFindUniqueOrThrowArgs} args - Arguments to find a Factory
     * @example
     * // Get one Factory
     * const factory = await prisma.factory.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends FactoryFindUniqueOrThrowArgs>(args: SelectSubset<T, FactoryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Factory that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryFindFirstArgs} args - Arguments to find a Factory
     * @example
     * // Get one Factory
     * const factory = await prisma.factory.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends FactoryFindFirstArgs>(args?: SelectSubset<T, FactoryFindFirstArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Factory that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryFindFirstOrThrowArgs} args - Arguments to find a Factory
     * @example
     * // Get one Factory
     * const factory = await prisma.factory.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends FactoryFindFirstOrThrowArgs>(args?: SelectSubset<T, FactoryFindFirstOrThrowArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Factories that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Factories
     * const factories = await prisma.factory.findMany()
     * 
     * // Get first 10 Factories
     * const factories = await prisma.factory.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const factoryWithIdOnly = await prisma.factory.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends FactoryFindManyArgs>(args?: SelectSubset<T, FactoryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Factory.
     * @param {FactoryCreateArgs} args - Arguments to create a Factory.
     * @example
     * // Create one Factory
     * const Factory = await prisma.factory.create({
     *   data: {
     *     // ... data to create a Factory
     *   }
     * })
     * 
     */
    create<T extends FactoryCreateArgs>(args: SelectSubset<T, FactoryCreateArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Factories.
     * @param {FactoryCreateManyArgs} args - Arguments to create many Factories.
     * @example
     * // Create many Factories
     * const factory = await prisma.factory.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends FactoryCreateManyArgs>(args?: SelectSubset<T, FactoryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Factories and returns the data saved in the database.
     * @param {FactoryCreateManyAndReturnArgs} args - Arguments to create many Factories.
     * @example
     * // Create many Factories
     * const factory = await prisma.factory.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Factories and only return the `id`
     * const factoryWithIdOnly = await prisma.factory.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends FactoryCreateManyAndReturnArgs>(args?: SelectSubset<T, FactoryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Factory.
     * @param {FactoryDeleteArgs} args - Arguments to delete one Factory.
     * @example
     * // Delete one Factory
     * const Factory = await prisma.factory.delete({
     *   where: {
     *     // ... filter to delete one Factory
     *   }
     * })
     * 
     */
    delete<T extends FactoryDeleteArgs>(args: SelectSubset<T, FactoryDeleteArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Factory.
     * @param {FactoryUpdateArgs} args - Arguments to update one Factory.
     * @example
     * // Update one Factory
     * const factory = await prisma.factory.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends FactoryUpdateArgs>(args: SelectSubset<T, FactoryUpdateArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Factories.
     * @param {FactoryDeleteManyArgs} args - Arguments to filter Factories to delete.
     * @example
     * // Delete a few Factories
     * const { count } = await prisma.factory.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends FactoryDeleteManyArgs>(args?: SelectSubset<T, FactoryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Factories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Factories
     * const factory = await prisma.factory.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends FactoryUpdateManyArgs>(args: SelectSubset<T, FactoryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Factories and returns the data updated in the database.
     * @param {FactoryUpdateManyAndReturnArgs} args - Arguments to update many Factories.
     * @example
     * // Update many Factories
     * const factory = await prisma.factory.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Factories and only return the `id`
     * const factoryWithIdOnly = await prisma.factory.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends FactoryUpdateManyAndReturnArgs>(args: SelectSubset<T, FactoryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Factory.
     * @param {FactoryUpsertArgs} args - Arguments to update or create a Factory.
     * @example
     * // Update or create a Factory
     * const factory = await prisma.factory.upsert({
     *   create: {
     *     // ... data to create a Factory
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Factory we want to update
     *   }
     * })
     */
    upsert<T extends FactoryUpsertArgs>(args: SelectSubset<T, FactoryUpsertArgs<ExtArgs>>): Prisma__FactoryClient<$Result.GetResult<Prisma.$FactoryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Factories.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryCountArgs} args - Arguments to filter Factories to count.
     * @example
     * // Count the number of Factories
     * const count = await prisma.factory.count({
     *   where: {
     *     // ... the filter for the Factories we want to count
     *   }
     * })
    **/
    count<T extends FactoryCountArgs>(
      args?: Subset<T, FactoryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], FactoryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Factory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends FactoryAggregateArgs>(args: Subset<T, FactoryAggregateArgs>): Prisma.PrismaPromise<GetFactoryAggregateType<T>>

    /**
     * Group by Factory.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FactoryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends FactoryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: FactoryGroupByArgs['orderBy'] }
        : { orderBy?: FactoryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, FactoryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetFactoryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Factory model
   */
  readonly fields: FactoryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Factory.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__FactoryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    businessUnit<T extends BusinessUnitDefaultArgs<ExtArgs> = {}>(args?: Subset<T, BusinessUnitDefaultArgs<ExtArgs>>): Prisma__BusinessUnitClient<$Result.GetResult<Prisma.$BusinessUnitPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Factory model
   */
  interface FactoryFieldRefs {
    readonly id: FieldRef<"Factory", 'String'>
    readonly tenantId: FieldRef<"Factory", 'String'>
    readonly businessUnitId: FieldRef<"Factory", 'String'>
    readonly name: FieldRef<"Factory", 'String'>
    readonly createdAt: FieldRef<"Factory", 'DateTime'>
    readonly updatedAt: FieldRef<"Factory", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Factory findUnique
   */
  export type FactoryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter, which Factory to fetch.
     */
    where: FactoryWhereUniqueInput
  }

  /**
   * Factory findUniqueOrThrow
   */
  export type FactoryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter, which Factory to fetch.
     */
    where: FactoryWhereUniqueInput
  }

  /**
   * Factory findFirst
   */
  export type FactoryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter, which Factory to fetch.
     */
    where?: FactoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Factories to fetch.
     */
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Factories.
     */
    cursor?: FactoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Factories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Factories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Factories.
     */
    distinct?: FactoryScalarFieldEnum | FactoryScalarFieldEnum[]
  }

  /**
   * Factory findFirstOrThrow
   */
  export type FactoryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter, which Factory to fetch.
     */
    where?: FactoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Factories to fetch.
     */
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Factories.
     */
    cursor?: FactoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Factories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Factories.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Factories.
     */
    distinct?: FactoryScalarFieldEnum | FactoryScalarFieldEnum[]
  }

  /**
   * Factory findMany
   */
  export type FactoryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter, which Factories to fetch.
     */
    where?: FactoryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Factories to fetch.
     */
    orderBy?: FactoryOrderByWithRelationInput | FactoryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Factories.
     */
    cursor?: FactoryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Factories from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Factories.
     */
    skip?: number
    distinct?: FactoryScalarFieldEnum | FactoryScalarFieldEnum[]
  }

  /**
   * Factory create
   */
  export type FactoryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * The data needed to create a Factory.
     */
    data: XOR<FactoryCreateInput, FactoryUncheckedCreateInput>
  }

  /**
   * Factory createMany
   */
  export type FactoryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Factories.
     */
    data: FactoryCreateManyInput | FactoryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Factory createManyAndReturn
   */
  export type FactoryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * The data used to create many Factories.
     */
    data: FactoryCreateManyInput | FactoryCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Factory update
   */
  export type FactoryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * The data needed to update a Factory.
     */
    data: XOR<FactoryUpdateInput, FactoryUncheckedUpdateInput>
    /**
     * Choose, which Factory to update.
     */
    where: FactoryWhereUniqueInput
  }

  /**
   * Factory updateMany
   */
  export type FactoryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Factories.
     */
    data: XOR<FactoryUpdateManyMutationInput, FactoryUncheckedUpdateManyInput>
    /**
     * Filter which Factories to update
     */
    where?: FactoryWhereInput
    /**
     * Limit how many Factories to update.
     */
    limit?: number
  }

  /**
   * Factory updateManyAndReturn
   */
  export type FactoryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * The data used to update Factories.
     */
    data: XOR<FactoryUpdateManyMutationInput, FactoryUncheckedUpdateManyInput>
    /**
     * Filter which Factories to update
     */
    where?: FactoryWhereInput
    /**
     * Limit how many Factories to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Factory upsert
   */
  export type FactoryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * The filter to search for the Factory to update in case it exists.
     */
    where: FactoryWhereUniqueInput
    /**
     * In case the Factory found by the `where` argument doesn't exist, create a new Factory with this data.
     */
    create: XOR<FactoryCreateInput, FactoryUncheckedCreateInput>
    /**
     * In case the Factory was found with the provided `where` argument, update it with this data.
     */
    update: XOR<FactoryUpdateInput, FactoryUncheckedUpdateInput>
  }

  /**
   * Factory delete
   */
  export type FactoryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
    /**
     * Filter which Factory to delete.
     */
    where: FactoryWhereUniqueInput
  }

  /**
   * Factory deleteMany
   */
  export type FactoryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Factories to delete
     */
    where?: FactoryWhereInput
    /**
     * Limit how many Factories to delete.
     */
    limit?: number
  }

  /**
   * Factory without action
   */
  export type FactoryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Factory
     */
    select?: FactorySelect<ExtArgs> | null
    /**
     * Omit specific fields from the Factory
     */
    omit?: FactoryOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FactoryInclude<ExtArgs> | null
  }


  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    email: string | null
    displayName: string | null
    status: $Enums.UserStatus | null
    idpSubject: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    email: string | null
    displayName: string | null
    status: $Enums.UserStatus | null
    idpSubject: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    tenantId: number
    email: number
    displayName: number
    status: number
    idpSubject: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    tenantId?: true
    email?: true
    displayName?: true
    status?: true
    idpSubject?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    tenantId?: true
    email?: true
    displayName?: true
    status?: true
    idpSubject?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    tenantId?: true
    email?: true
    displayName?: true
    status?: true
    idpSubject?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    tenantId: string
    email: string
    displayName: string
    status: $Enums.UserStatus
    idpSubject: string | null
    createdAt: Date
    updatedAt: Date
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    email?: boolean
    displayName?: boolean
    status?: boolean
    idpSubject?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    roleAssignments?: boolean | User$roleAssignmentsArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    email?: boolean
    displayName?: boolean
    status?: boolean
    idpSubject?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    email?: boolean
    displayName?: boolean
    status?: boolean
    idpSubject?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    tenantId?: boolean
    email?: boolean
    displayName?: boolean
    status?: boolean
    idpSubject?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "email" | "displayName" | "status" | "idpSubject" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    roleAssignments?: boolean | User$roleAssignmentsArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type UserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      roleAssignments: Prisma.$UserRoleAssignmentPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      email: string
      displayName: string
      status: $Enums.UserStatus
      /**
       * Subject identifier at the OIDC identity provider (provider-neutral linkage).
       */
      idpSubject: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    roleAssignments<T extends User$roleAssignmentsArgs<ExtArgs> = {}>(args?: Subset<T, User$roleAssignmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly tenantId: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly displayName: FieldRef<"User", 'String'>
    readonly status: FieldRef<"User", 'UserStatus'>
    readonly idpSubject: FieldRef<"User", 'String'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User.roleAssignments
   */
  export type User$roleAssignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    where?: UserRoleAssignmentWhereInput
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    cursor?: UserRoleAssignmentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model Role
   */

  export type AggregateRole = {
    _count: RoleCountAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  export type RoleMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    description: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type RoleMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    description: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type RoleCountAggregateOutputType = {
    id: number
    tenantId: number
    name: number
    description: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type RoleMinAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    description?: true
    createdAt?: true
    updatedAt?: true
  }

  export type RoleMaxAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    description?: true
    createdAt?: true
    updatedAt?: true
  }

  export type RoleCountAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    description?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type RoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Role to aggregate.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Roles
    **/
    _count?: true | RoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RoleMaxAggregateInputType
  }

  export type GetRoleAggregateType<T extends RoleAggregateArgs> = {
        [P in keyof T & keyof AggregateRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRole[P]>
      : GetScalarType<T[P], AggregateRole[P]>
  }




  export type RoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithAggregationInput | RoleOrderByWithAggregationInput[]
    by: RoleScalarFieldEnum[] | RoleScalarFieldEnum
    having?: RoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RoleCountAggregateInputType | true
    _min?: RoleMinAggregateInputType
    _max?: RoleMaxAggregateInputType
  }

  export type RoleGroupByOutputType = {
    id: string
    tenantId: string
    name: string
    description: string | null
    createdAt: Date
    updatedAt: Date
    _count: RoleCountAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  type GetRoleGroupByPayload<T extends RoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RoleGroupByOutputType[P]>
            : GetScalarType<T[P], RoleGroupByOutputType[P]>
        }
      >
    >


  export type RoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    description?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    permissions?: boolean | Role$permissionsArgs<ExtArgs>
    assignments?: boolean | Role$assignmentsArgs<ExtArgs>
    _count?: boolean | RoleCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>

  export type RoleSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    description?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>

  export type RoleSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    description?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>

  export type RoleSelectScalar = {
    id?: boolean
    tenantId?: boolean
    name?: boolean
    description?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type RoleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "name" | "description" | "createdAt" | "updatedAt", ExtArgs["result"]["role"]>
  export type RoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    permissions?: boolean | Role$permissionsArgs<ExtArgs>
    assignments?: boolean | Role$assignmentsArgs<ExtArgs>
    _count?: boolean | RoleCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type RoleIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type RoleIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $RolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Role"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      permissions: Prisma.$RolePermissionPayload<ExtArgs>[]
      assignments: Prisma.$UserRoleAssignmentPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      name: string
      description: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["role"]>
    composites: {}
  }

  type RoleGetPayload<S extends boolean | null | undefined | RoleDefaultArgs> = $Result.GetResult<Prisma.$RolePayload, S>

  type RoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RoleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RoleCountAggregateInputType | true
    }

  export interface RoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Role'], meta: { name: 'Role' } }
    /**
     * Find zero or one Role that matches the filter.
     * @param {RoleFindUniqueArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RoleFindUniqueArgs>(args: SelectSubset<T, RoleFindUniqueArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Role that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RoleFindUniqueOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RoleFindUniqueOrThrowArgs>(args: SelectSubset<T, RoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Role that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RoleFindFirstArgs>(args?: SelectSubset<T, RoleFindFirstArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Role that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RoleFindFirstOrThrowArgs>(args?: SelectSubset<T, RoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Roles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Roles
     * const roles = await prisma.role.findMany()
     * 
     * // Get first 10 Roles
     * const roles = await prisma.role.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const roleWithIdOnly = await prisma.role.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RoleFindManyArgs>(args?: SelectSubset<T, RoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Role.
     * @param {RoleCreateArgs} args - Arguments to create a Role.
     * @example
     * // Create one Role
     * const Role = await prisma.role.create({
     *   data: {
     *     // ... data to create a Role
     *   }
     * })
     * 
     */
    create<T extends RoleCreateArgs>(args: SelectSubset<T, RoleCreateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Roles.
     * @param {RoleCreateManyArgs} args - Arguments to create many Roles.
     * @example
     * // Create many Roles
     * const role = await prisma.role.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RoleCreateManyArgs>(args?: SelectSubset<T, RoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Roles and returns the data saved in the database.
     * @param {RoleCreateManyAndReturnArgs} args - Arguments to create many Roles.
     * @example
     * // Create many Roles
     * const role = await prisma.role.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Roles and only return the `id`
     * const roleWithIdOnly = await prisma.role.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RoleCreateManyAndReturnArgs>(args?: SelectSubset<T, RoleCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Role.
     * @param {RoleDeleteArgs} args - Arguments to delete one Role.
     * @example
     * // Delete one Role
     * const Role = await prisma.role.delete({
     *   where: {
     *     // ... filter to delete one Role
     *   }
     * })
     * 
     */
    delete<T extends RoleDeleteArgs>(args: SelectSubset<T, RoleDeleteArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Role.
     * @param {RoleUpdateArgs} args - Arguments to update one Role.
     * @example
     * // Update one Role
     * const role = await prisma.role.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RoleUpdateArgs>(args: SelectSubset<T, RoleUpdateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Roles.
     * @param {RoleDeleteManyArgs} args - Arguments to filter Roles to delete.
     * @example
     * // Delete a few Roles
     * const { count } = await prisma.role.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RoleDeleteManyArgs>(args?: SelectSubset<T, RoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Roles
     * const role = await prisma.role.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RoleUpdateManyArgs>(args: SelectSubset<T, RoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Roles and returns the data updated in the database.
     * @param {RoleUpdateManyAndReturnArgs} args - Arguments to update many Roles.
     * @example
     * // Update many Roles
     * const role = await prisma.role.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Roles and only return the `id`
     * const roleWithIdOnly = await prisma.role.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends RoleUpdateManyAndReturnArgs>(args: SelectSubset<T, RoleUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Role.
     * @param {RoleUpsertArgs} args - Arguments to update or create a Role.
     * @example
     * // Update or create a Role
     * const role = await prisma.role.upsert({
     *   create: {
     *     // ... data to create a Role
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Role we want to update
     *   }
     * })
     */
    upsert<T extends RoleUpsertArgs>(args: SelectSubset<T, RoleUpsertArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleCountArgs} args - Arguments to filter Roles to count.
     * @example
     * // Count the number of Roles
     * const count = await prisma.role.count({
     *   where: {
     *     // ... the filter for the Roles we want to count
     *   }
     * })
    **/
    count<T extends RoleCountArgs>(
      args?: Subset<T, RoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RoleAggregateArgs>(args: Subset<T, RoleAggregateArgs>): Prisma.PrismaPromise<GetRoleAggregateType<T>>

    /**
     * Group by Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RoleGroupByArgs['orderBy'] }
        : { orderBy?: RoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Role model
   */
  readonly fields: RoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Role.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    permissions<T extends Role$permissionsArgs<ExtArgs> = {}>(args?: Subset<T, Role$permissionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    assignments<T extends Role$assignmentsArgs<ExtArgs> = {}>(args?: Subset<T, Role$assignmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Role model
   */
  interface RoleFieldRefs {
    readonly id: FieldRef<"Role", 'String'>
    readonly tenantId: FieldRef<"Role", 'String'>
    readonly name: FieldRef<"Role", 'String'>
    readonly description: FieldRef<"Role", 'String'>
    readonly createdAt: FieldRef<"Role", 'DateTime'>
    readonly updatedAt: FieldRef<"Role", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Role findUnique
   */
  export type RoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findUniqueOrThrow
   */
  export type RoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findFirst
   */
  export type RoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findFirstOrThrow
   */
  export type RoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findMany
   */
  export type RoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Roles to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role create
   */
  export type RoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to create a Role.
     */
    data: XOR<RoleCreateInput, RoleUncheckedCreateInput>
  }

  /**
   * Role createMany
   */
  export type RoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Roles.
     */
    data: RoleCreateManyInput | RoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Role createManyAndReturn
   */
  export type RoleCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * The data used to create many Roles.
     */
    data: RoleCreateManyInput | RoleCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Role update
   */
  export type RoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to update a Role.
     */
    data: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
    /**
     * Choose, which Role to update.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role updateMany
   */
  export type RoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Roles.
     */
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyInput>
    /**
     * Filter which Roles to update
     */
    where?: RoleWhereInput
    /**
     * Limit how many Roles to update.
     */
    limit?: number
  }

  /**
   * Role updateManyAndReturn
   */
  export type RoleUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * The data used to update Roles.
     */
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyInput>
    /**
     * Filter which Roles to update
     */
    where?: RoleWhereInput
    /**
     * Limit how many Roles to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Role upsert
   */
  export type RoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The filter to search for the Role to update in case it exists.
     */
    where: RoleWhereUniqueInput
    /**
     * In case the Role found by the `where` argument doesn't exist, create a new Role with this data.
     */
    create: XOR<RoleCreateInput, RoleUncheckedCreateInput>
    /**
     * In case the Role was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
  }

  /**
   * Role delete
   */
  export type RoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter which Role to delete.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role deleteMany
   */
  export type RoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Roles to delete
     */
    where?: RoleWhereInput
    /**
     * Limit how many Roles to delete.
     */
    limit?: number
  }

  /**
   * Role.permissions
   */
  export type Role$permissionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    where?: RolePermissionWhereInput
    orderBy?: RolePermissionOrderByWithRelationInput | RolePermissionOrderByWithRelationInput[]
    cursor?: RolePermissionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RolePermissionScalarFieldEnum | RolePermissionScalarFieldEnum[]
  }

  /**
   * Role.assignments
   */
  export type Role$assignmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    where?: UserRoleAssignmentWhereInput
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    cursor?: UserRoleAssignmentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * Role without action
   */
  export type RoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
  }


  /**
   * Model RolePermission
   */

  export type AggregateRolePermission = {
    _count: RolePermissionCountAggregateOutputType | null
    _min: RolePermissionMinAggregateOutputType | null
    _max: RolePermissionMaxAggregateOutputType | null
  }

  export type RolePermissionMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    roleId: string | null
    permissionKey: string | null
  }

  export type RolePermissionMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    roleId: string | null
    permissionKey: string | null
  }

  export type RolePermissionCountAggregateOutputType = {
    id: number
    tenantId: number
    roleId: number
    permissionKey: number
    _all: number
  }


  export type RolePermissionMinAggregateInputType = {
    id?: true
    tenantId?: true
    roleId?: true
    permissionKey?: true
  }

  export type RolePermissionMaxAggregateInputType = {
    id?: true
    tenantId?: true
    roleId?: true
    permissionKey?: true
  }

  export type RolePermissionCountAggregateInputType = {
    id?: true
    tenantId?: true
    roleId?: true
    permissionKey?: true
    _all?: true
  }

  export type RolePermissionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RolePermission to aggregate.
     */
    where?: RolePermissionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePermissions to fetch.
     */
    orderBy?: RolePermissionOrderByWithRelationInput | RolePermissionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RolePermissionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePermissions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePermissions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RolePermissions
    **/
    _count?: true | RolePermissionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RolePermissionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RolePermissionMaxAggregateInputType
  }

  export type GetRolePermissionAggregateType<T extends RolePermissionAggregateArgs> = {
        [P in keyof T & keyof AggregateRolePermission]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRolePermission[P]>
      : GetScalarType<T[P], AggregateRolePermission[P]>
  }




  export type RolePermissionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RolePermissionWhereInput
    orderBy?: RolePermissionOrderByWithAggregationInput | RolePermissionOrderByWithAggregationInput[]
    by: RolePermissionScalarFieldEnum[] | RolePermissionScalarFieldEnum
    having?: RolePermissionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RolePermissionCountAggregateInputType | true
    _min?: RolePermissionMinAggregateInputType
    _max?: RolePermissionMaxAggregateInputType
  }

  export type RolePermissionGroupByOutputType = {
    id: string
    tenantId: string
    roleId: string
    permissionKey: string
    _count: RolePermissionCountAggregateOutputType | null
    _min: RolePermissionMinAggregateOutputType | null
    _max: RolePermissionMaxAggregateOutputType | null
  }

  type GetRolePermissionGroupByPayload<T extends RolePermissionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RolePermissionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RolePermissionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RolePermissionGroupByOutputType[P]>
            : GetScalarType<T[P], RolePermissionGroupByOutputType[P]>
        }
      >
    >


  export type RolePermissionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    roleId?: boolean
    permissionKey?: boolean
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["rolePermission"]>

  export type RolePermissionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    roleId?: boolean
    permissionKey?: boolean
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["rolePermission"]>

  export type RolePermissionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    roleId?: boolean
    permissionKey?: boolean
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["rolePermission"]>

  export type RolePermissionSelectScalar = {
    id?: boolean
    tenantId?: boolean
    roleId?: boolean
    permissionKey?: boolean
  }

  export type RolePermissionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "roleId" | "permissionKey", ExtArgs["result"]["rolePermission"]>
  export type RolePermissionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }
  export type RolePermissionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }
  export type RolePermissionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }

  export type $RolePermissionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RolePermission"
    objects: {
      role: Prisma.$RolePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      roleId: string
      /**
       * Permission key, `<domain>.<resource/action>` (specs/permissions.csv).
       */
      permissionKey: string
    }, ExtArgs["result"]["rolePermission"]>
    composites: {}
  }

  type RolePermissionGetPayload<S extends boolean | null | undefined | RolePermissionDefaultArgs> = $Result.GetResult<Prisma.$RolePermissionPayload, S>

  type RolePermissionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RolePermissionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RolePermissionCountAggregateInputType | true
    }

  export interface RolePermissionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RolePermission'], meta: { name: 'RolePermission' } }
    /**
     * Find zero or one RolePermission that matches the filter.
     * @param {RolePermissionFindUniqueArgs} args - Arguments to find a RolePermission
     * @example
     * // Get one RolePermission
     * const rolePermission = await prisma.rolePermission.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RolePermissionFindUniqueArgs>(args: SelectSubset<T, RolePermissionFindUniqueArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one RolePermission that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RolePermissionFindUniqueOrThrowArgs} args - Arguments to find a RolePermission
     * @example
     * // Get one RolePermission
     * const rolePermission = await prisma.rolePermission.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RolePermissionFindUniqueOrThrowArgs>(args: SelectSubset<T, RolePermissionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RolePermission that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionFindFirstArgs} args - Arguments to find a RolePermission
     * @example
     * // Get one RolePermission
     * const rolePermission = await prisma.rolePermission.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RolePermissionFindFirstArgs>(args?: SelectSubset<T, RolePermissionFindFirstArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RolePermission that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionFindFirstOrThrowArgs} args - Arguments to find a RolePermission
     * @example
     * // Get one RolePermission
     * const rolePermission = await prisma.rolePermission.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RolePermissionFindFirstOrThrowArgs>(args?: SelectSubset<T, RolePermissionFindFirstOrThrowArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more RolePermissions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RolePermissions
     * const rolePermissions = await prisma.rolePermission.findMany()
     * 
     * // Get first 10 RolePermissions
     * const rolePermissions = await prisma.rolePermission.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const rolePermissionWithIdOnly = await prisma.rolePermission.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RolePermissionFindManyArgs>(args?: SelectSubset<T, RolePermissionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a RolePermission.
     * @param {RolePermissionCreateArgs} args - Arguments to create a RolePermission.
     * @example
     * // Create one RolePermission
     * const RolePermission = await prisma.rolePermission.create({
     *   data: {
     *     // ... data to create a RolePermission
     *   }
     * })
     * 
     */
    create<T extends RolePermissionCreateArgs>(args: SelectSubset<T, RolePermissionCreateArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many RolePermissions.
     * @param {RolePermissionCreateManyArgs} args - Arguments to create many RolePermissions.
     * @example
     * // Create many RolePermissions
     * const rolePermission = await prisma.rolePermission.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RolePermissionCreateManyArgs>(args?: SelectSubset<T, RolePermissionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many RolePermissions and returns the data saved in the database.
     * @param {RolePermissionCreateManyAndReturnArgs} args - Arguments to create many RolePermissions.
     * @example
     * // Create many RolePermissions
     * const rolePermission = await prisma.rolePermission.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many RolePermissions and only return the `id`
     * const rolePermissionWithIdOnly = await prisma.rolePermission.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RolePermissionCreateManyAndReturnArgs>(args?: SelectSubset<T, RolePermissionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a RolePermission.
     * @param {RolePermissionDeleteArgs} args - Arguments to delete one RolePermission.
     * @example
     * // Delete one RolePermission
     * const RolePermission = await prisma.rolePermission.delete({
     *   where: {
     *     // ... filter to delete one RolePermission
     *   }
     * })
     * 
     */
    delete<T extends RolePermissionDeleteArgs>(args: SelectSubset<T, RolePermissionDeleteArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one RolePermission.
     * @param {RolePermissionUpdateArgs} args - Arguments to update one RolePermission.
     * @example
     * // Update one RolePermission
     * const rolePermission = await prisma.rolePermission.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RolePermissionUpdateArgs>(args: SelectSubset<T, RolePermissionUpdateArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more RolePermissions.
     * @param {RolePermissionDeleteManyArgs} args - Arguments to filter RolePermissions to delete.
     * @example
     * // Delete a few RolePermissions
     * const { count } = await prisma.rolePermission.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RolePermissionDeleteManyArgs>(args?: SelectSubset<T, RolePermissionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RolePermissions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RolePermissions
     * const rolePermission = await prisma.rolePermission.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RolePermissionUpdateManyArgs>(args: SelectSubset<T, RolePermissionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RolePermissions and returns the data updated in the database.
     * @param {RolePermissionUpdateManyAndReturnArgs} args - Arguments to update many RolePermissions.
     * @example
     * // Update many RolePermissions
     * const rolePermission = await prisma.rolePermission.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more RolePermissions and only return the `id`
     * const rolePermissionWithIdOnly = await prisma.rolePermission.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends RolePermissionUpdateManyAndReturnArgs>(args: SelectSubset<T, RolePermissionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one RolePermission.
     * @param {RolePermissionUpsertArgs} args - Arguments to update or create a RolePermission.
     * @example
     * // Update or create a RolePermission
     * const rolePermission = await prisma.rolePermission.upsert({
     *   create: {
     *     // ... data to create a RolePermission
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RolePermission we want to update
     *   }
     * })
     */
    upsert<T extends RolePermissionUpsertArgs>(args: SelectSubset<T, RolePermissionUpsertArgs<ExtArgs>>): Prisma__RolePermissionClient<$Result.GetResult<Prisma.$RolePermissionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of RolePermissions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionCountArgs} args - Arguments to filter RolePermissions to count.
     * @example
     * // Count the number of RolePermissions
     * const count = await prisma.rolePermission.count({
     *   where: {
     *     // ... the filter for the RolePermissions we want to count
     *   }
     * })
    **/
    count<T extends RolePermissionCountArgs>(
      args?: Subset<T, RolePermissionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RolePermissionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RolePermission.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RolePermissionAggregateArgs>(args: Subset<T, RolePermissionAggregateArgs>): Prisma.PrismaPromise<GetRolePermissionAggregateType<T>>

    /**
     * Group by RolePermission.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePermissionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RolePermissionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RolePermissionGroupByArgs['orderBy'] }
        : { orderBy?: RolePermissionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RolePermissionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRolePermissionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RolePermission model
   */
  readonly fields: RolePermissionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RolePermission.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RolePermissionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the RolePermission model
   */
  interface RolePermissionFieldRefs {
    readonly id: FieldRef<"RolePermission", 'String'>
    readonly tenantId: FieldRef<"RolePermission", 'String'>
    readonly roleId: FieldRef<"RolePermission", 'String'>
    readonly permissionKey: FieldRef<"RolePermission", 'String'>
  }
    

  // Custom InputTypes
  /**
   * RolePermission findUnique
   */
  export type RolePermissionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter, which RolePermission to fetch.
     */
    where: RolePermissionWhereUniqueInput
  }

  /**
   * RolePermission findUniqueOrThrow
   */
  export type RolePermissionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter, which RolePermission to fetch.
     */
    where: RolePermissionWhereUniqueInput
  }

  /**
   * RolePermission findFirst
   */
  export type RolePermissionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter, which RolePermission to fetch.
     */
    where?: RolePermissionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePermissions to fetch.
     */
    orderBy?: RolePermissionOrderByWithRelationInput | RolePermissionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RolePermissions.
     */
    cursor?: RolePermissionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePermissions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePermissions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RolePermissions.
     */
    distinct?: RolePermissionScalarFieldEnum | RolePermissionScalarFieldEnum[]
  }

  /**
   * RolePermission findFirstOrThrow
   */
  export type RolePermissionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter, which RolePermission to fetch.
     */
    where?: RolePermissionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePermissions to fetch.
     */
    orderBy?: RolePermissionOrderByWithRelationInput | RolePermissionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RolePermissions.
     */
    cursor?: RolePermissionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePermissions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePermissions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RolePermissions.
     */
    distinct?: RolePermissionScalarFieldEnum | RolePermissionScalarFieldEnum[]
  }

  /**
   * RolePermission findMany
   */
  export type RolePermissionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter, which RolePermissions to fetch.
     */
    where?: RolePermissionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePermissions to fetch.
     */
    orderBy?: RolePermissionOrderByWithRelationInput | RolePermissionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RolePermissions.
     */
    cursor?: RolePermissionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePermissions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePermissions.
     */
    skip?: number
    distinct?: RolePermissionScalarFieldEnum | RolePermissionScalarFieldEnum[]
  }

  /**
   * RolePermission create
   */
  export type RolePermissionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * The data needed to create a RolePermission.
     */
    data: XOR<RolePermissionCreateInput, RolePermissionUncheckedCreateInput>
  }

  /**
   * RolePermission createMany
   */
  export type RolePermissionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RolePermissions.
     */
    data: RolePermissionCreateManyInput | RolePermissionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RolePermission createManyAndReturn
   */
  export type RolePermissionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * The data used to create many RolePermissions.
     */
    data: RolePermissionCreateManyInput | RolePermissionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * RolePermission update
   */
  export type RolePermissionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * The data needed to update a RolePermission.
     */
    data: XOR<RolePermissionUpdateInput, RolePermissionUncheckedUpdateInput>
    /**
     * Choose, which RolePermission to update.
     */
    where: RolePermissionWhereUniqueInput
  }

  /**
   * RolePermission updateMany
   */
  export type RolePermissionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RolePermissions.
     */
    data: XOR<RolePermissionUpdateManyMutationInput, RolePermissionUncheckedUpdateManyInput>
    /**
     * Filter which RolePermissions to update
     */
    where?: RolePermissionWhereInput
    /**
     * Limit how many RolePermissions to update.
     */
    limit?: number
  }

  /**
   * RolePermission updateManyAndReturn
   */
  export type RolePermissionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * The data used to update RolePermissions.
     */
    data: XOR<RolePermissionUpdateManyMutationInput, RolePermissionUncheckedUpdateManyInput>
    /**
     * Filter which RolePermissions to update
     */
    where?: RolePermissionWhereInput
    /**
     * Limit how many RolePermissions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * RolePermission upsert
   */
  export type RolePermissionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * The filter to search for the RolePermission to update in case it exists.
     */
    where: RolePermissionWhereUniqueInput
    /**
     * In case the RolePermission found by the `where` argument doesn't exist, create a new RolePermission with this data.
     */
    create: XOR<RolePermissionCreateInput, RolePermissionUncheckedCreateInput>
    /**
     * In case the RolePermission was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RolePermissionUpdateInput, RolePermissionUncheckedUpdateInput>
  }

  /**
   * RolePermission delete
   */
  export type RolePermissionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
    /**
     * Filter which RolePermission to delete.
     */
    where: RolePermissionWhereUniqueInput
  }

  /**
   * RolePermission deleteMany
   */
  export type RolePermissionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RolePermissions to delete
     */
    where?: RolePermissionWhereInput
    /**
     * Limit how many RolePermissions to delete.
     */
    limit?: number
  }

  /**
   * RolePermission without action
   */
  export type RolePermissionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePermission
     */
    select?: RolePermissionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePermission
     */
    omit?: RolePermissionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePermissionInclude<ExtArgs> | null
  }


  /**
   * Model UserRoleAssignment
   */

  export type AggregateUserRoleAssignment = {
    _count: UserRoleAssignmentCountAggregateOutputType | null
    _min: UserRoleAssignmentMinAggregateOutputType | null
    _max: UserRoleAssignmentMaxAggregateOutputType | null
  }

  export type UserRoleAssignmentMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    userId: string | null
    roleId: string | null
    scopeType: $Enums.ScopeType | null
    scopeId: string | null
    createdAt: Date | null
  }

  export type UserRoleAssignmentMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    userId: string | null
    roleId: string | null
    scopeType: $Enums.ScopeType | null
    scopeId: string | null
    createdAt: Date | null
  }

  export type UserRoleAssignmentCountAggregateOutputType = {
    id: number
    tenantId: number
    userId: number
    roleId: number
    scopeType: number
    scopeId: number
    createdAt: number
    _all: number
  }


  export type UserRoleAssignmentMinAggregateInputType = {
    id?: true
    tenantId?: true
    userId?: true
    roleId?: true
    scopeType?: true
    scopeId?: true
    createdAt?: true
  }

  export type UserRoleAssignmentMaxAggregateInputType = {
    id?: true
    tenantId?: true
    userId?: true
    roleId?: true
    scopeType?: true
    scopeId?: true
    createdAt?: true
  }

  export type UserRoleAssignmentCountAggregateInputType = {
    id?: true
    tenantId?: true
    userId?: true
    roleId?: true
    scopeType?: true
    scopeId?: true
    createdAt?: true
    _all?: true
  }

  export type UserRoleAssignmentAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserRoleAssignment to aggregate.
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserRoleAssignments to fetch.
     */
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserRoleAssignmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserRoleAssignments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserRoleAssignments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned UserRoleAssignments
    **/
    _count?: true | UserRoleAssignmentCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserRoleAssignmentMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserRoleAssignmentMaxAggregateInputType
  }

  export type GetUserRoleAssignmentAggregateType<T extends UserRoleAssignmentAggregateArgs> = {
        [P in keyof T & keyof AggregateUserRoleAssignment]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUserRoleAssignment[P]>
      : GetScalarType<T[P], AggregateUserRoleAssignment[P]>
  }




  export type UserRoleAssignmentGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserRoleAssignmentWhereInput
    orderBy?: UserRoleAssignmentOrderByWithAggregationInput | UserRoleAssignmentOrderByWithAggregationInput[]
    by: UserRoleAssignmentScalarFieldEnum[] | UserRoleAssignmentScalarFieldEnum
    having?: UserRoleAssignmentScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserRoleAssignmentCountAggregateInputType | true
    _min?: UserRoleAssignmentMinAggregateInputType
    _max?: UserRoleAssignmentMaxAggregateInputType
  }

  export type UserRoleAssignmentGroupByOutputType = {
    id: string
    tenantId: string
    userId: string
    roleId: string
    scopeType: $Enums.ScopeType
    scopeId: string
    createdAt: Date
    _count: UserRoleAssignmentCountAggregateOutputType | null
    _min: UserRoleAssignmentMinAggregateOutputType | null
    _max: UserRoleAssignmentMaxAggregateOutputType | null
  }

  type GetUserRoleAssignmentGroupByPayload<T extends UserRoleAssignmentGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserRoleAssignmentGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserRoleAssignmentGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserRoleAssignmentGroupByOutputType[P]>
            : GetScalarType<T[P], UserRoleAssignmentGroupByOutputType[P]>
        }
      >
    >


  export type UserRoleAssignmentSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    userId?: boolean
    roleId?: boolean
    scopeType?: boolean
    scopeId?: boolean
    createdAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["userRoleAssignment"]>

  export type UserRoleAssignmentSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    userId?: boolean
    roleId?: boolean
    scopeType?: boolean
    scopeId?: boolean
    createdAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["userRoleAssignment"]>

  export type UserRoleAssignmentSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    userId?: boolean
    roleId?: boolean
    scopeType?: boolean
    scopeId?: boolean
    createdAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["userRoleAssignment"]>

  export type UserRoleAssignmentSelectScalar = {
    id?: boolean
    tenantId?: boolean
    userId?: boolean
    roleId?: boolean
    scopeType?: boolean
    scopeId?: boolean
    createdAt?: boolean
  }

  export type UserRoleAssignmentOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "userId" | "roleId" | "scopeType" | "scopeId" | "createdAt", ExtArgs["result"]["userRoleAssignment"]>
  export type UserRoleAssignmentInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }
  export type UserRoleAssignmentIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }
  export type UserRoleAssignmentIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }

  export type $UserRoleAssignmentPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "UserRoleAssignment"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
      user: Prisma.$UserPayload<ExtArgs>
      role: Prisma.$RolePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      userId: string
      roleId: string
      scopeType: $Enums.ScopeType
      /**
       * Scope target: the tenant id for TENANT scope, otherwise the org node id.
       */
      scopeId: string
      createdAt: Date
    }, ExtArgs["result"]["userRoleAssignment"]>
    composites: {}
  }

  type UserRoleAssignmentGetPayload<S extends boolean | null | undefined | UserRoleAssignmentDefaultArgs> = $Result.GetResult<Prisma.$UserRoleAssignmentPayload, S>

  type UserRoleAssignmentCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserRoleAssignmentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserRoleAssignmentCountAggregateInputType | true
    }

  export interface UserRoleAssignmentDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['UserRoleAssignment'], meta: { name: 'UserRoleAssignment' } }
    /**
     * Find zero or one UserRoleAssignment that matches the filter.
     * @param {UserRoleAssignmentFindUniqueArgs} args - Arguments to find a UserRoleAssignment
     * @example
     * // Get one UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserRoleAssignmentFindUniqueArgs>(args: SelectSubset<T, UserRoleAssignmentFindUniqueArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one UserRoleAssignment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserRoleAssignmentFindUniqueOrThrowArgs} args - Arguments to find a UserRoleAssignment
     * @example
     * // Get one UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserRoleAssignmentFindUniqueOrThrowArgs>(args: SelectSubset<T, UserRoleAssignmentFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserRoleAssignment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentFindFirstArgs} args - Arguments to find a UserRoleAssignment
     * @example
     * // Get one UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserRoleAssignmentFindFirstArgs>(args?: SelectSubset<T, UserRoleAssignmentFindFirstArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first UserRoleAssignment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentFindFirstOrThrowArgs} args - Arguments to find a UserRoleAssignment
     * @example
     * // Get one UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserRoleAssignmentFindFirstOrThrowArgs>(args?: SelectSubset<T, UserRoleAssignmentFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more UserRoleAssignments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all UserRoleAssignments
     * const userRoleAssignments = await prisma.userRoleAssignment.findMany()
     * 
     * // Get first 10 UserRoleAssignments
     * const userRoleAssignments = await prisma.userRoleAssignment.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userRoleAssignmentWithIdOnly = await prisma.userRoleAssignment.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserRoleAssignmentFindManyArgs>(args?: SelectSubset<T, UserRoleAssignmentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a UserRoleAssignment.
     * @param {UserRoleAssignmentCreateArgs} args - Arguments to create a UserRoleAssignment.
     * @example
     * // Create one UserRoleAssignment
     * const UserRoleAssignment = await prisma.userRoleAssignment.create({
     *   data: {
     *     // ... data to create a UserRoleAssignment
     *   }
     * })
     * 
     */
    create<T extends UserRoleAssignmentCreateArgs>(args: SelectSubset<T, UserRoleAssignmentCreateArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many UserRoleAssignments.
     * @param {UserRoleAssignmentCreateManyArgs} args - Arguments to create many UserRoleAssignments.
     * @example
     * // Create many UserRoleAssignments
     * const userRoleAssignment = await prisma.userRoleAssignment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserRoleAssignmentCreateManyArgs>(args?: SelectSubset<T, UserRoleAssignmentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many UserRoleAssignments and returns the data saved in the database.
     * @param {UserRoleAssignmentCreateManyAndReturnArgs} args - Arguments to create many UserRoleAssignments.
     * @example
     * // Create many UserRoleAssignments
     * const userRoleAssignment = await prisma.userRoleAssignment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many UserRoleAssignments and only return the `id`
     * const userRoleAssignmentWithIdOnly = await prisma.userRoleAssignment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserRoleAssignmentCreateManyAndReturnArgs>(args?: SelectSubset<T, UserRoleAssignmentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a UserRoleAssignment.
     * @param {UserRoleAssignmentDeleteArgs} args - Arguments to delete one UserRoleAssignment.
     * @example
     * // Delete one UserRoleAssignment
     * const UserRoleAssignment = await prisma.userRoleAssignment.delete({
     *   where: {
     *     // ... filter to delete one UserRoleAssignment
     *   }
     * })
     * 
     */
    delete<T extends UserRoleAssignmentDeleteArgs>(args: SelectSubset<T, UserRoleAssignmentDeleteArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one UserRoleAssignment.
     * @param {UserRoleAssignmentUpdateArgs} args - Arguments to update one UserRoleAssignment.
     * @example
     * // Update one UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserRoleAssignmentUpdateArgs>(args: SelectSubset<T, UserRoleAssignmentUpdateArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more UserRoleAssignments.
     * @param {UserRoleAssignmentDeleteManyArgs} args - Arguments to filter UserRoleAssignments to delete.
     * @example
     * // Delete a few UserRoleAssignments
     * const { count } = await prisma.userRoleAssignment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserRoleAssignmentDeleteManyArgs>(args?: SelectSubset<T, UserRoleAssignmentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserRoleAssignments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many UserRoleAssignments
     * const userRoleAssignment = await prisma.userRoleAssignment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserRoleAssignmentUpdateManyArgs>(args: SelectSubset<T, UserRoleAssignmentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more UserRoleAssignments and returns the data updated in the database.
     * @param {UserRoleAssignmentUpdateManyAndReturnArgs} args - Arguments to update many UserRoleAssignments.
     * @example
     * // Update many UserRoleAssignments
     * const userRoleAssignment = await prisma.userRoleAssignment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more UserRoleAssignments and only return the `id`
     * const userRoleAssignmentWithIdOnly = await prisma.userRoleAssignment.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserRoleAssignmentUpdateManyAndReturnArgs>(args: SelectSubset<T, UserRoleAssignmentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one UserRoleAssignment.
     * @param {UserRoleAssignmentUpsertArgs} args - Arguments to update or create a UserRoleAssignment.
     * @example
     * // Update or create a UserRoleAssignment
     * const userRoleAssignment = await prisma.userRoleAssignment.upsert({
     *   create: {
     *     // ... data to create a UserRoleAssignment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the UserRoleAssignment we want to update
     *   }
     * })
     */
    upsert<T extends UserRoleAssignmentUpsertArgs>(args: SelectSubset<T, UserRoleAssignmentUpsertArgs<ExtArgs>>): Prisma__UserRoleAssignmentClient<$Result.GetResult<Prisma.$UserRoleAssignmentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of UserRoleAssignments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentCountArgs} args - Arguments to filter UserRoleAssignments to count.
     * @example
     * // Count the number of UserRoleAssignments
     * const count = await prisma.userRoleAssignment.count({
     *   where: {
     *     // ... the filter for the UserRoleAssignments we want to count
     *   }
     * })
    **/
    count<T extends UserRoleAssignmentCountArgs>(
      args?: Subset<T, UserRoleAssignmentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserRoleAssignmentCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a UserRoleAssignment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserRoleAssignmentAggregateArgs>(args: Subset<T, UserRoleAssignmentAggregateArgs>): Prisma.PrismaPromise<GetUserRoleAssignmentAggregateType<T>>

    /**
     * Group by UserRoleAssignment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserRoleAssignmentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserRoleAssignmentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserRoleAssignmentGroupByArgs['orderBy'] }
        : { orderBy?: UserRoleAssignmentGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserRoleAssignmentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserRoleAssignmentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the UserRoleAssignment model
   */
  readonly fields: UserRoleAssignmentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for UserRoleAssignment.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserRoleAssignmentClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the UserRoleAssignment model
   */
  interface UserRoleAssignmentFieldRefs {
    readonly id: FieldRef<"UserRoleAssignment", 'String'>
    readonly tenantId: FieldRef<"UserRoleAssignment", 'String'>
    readonly userId: FieldRef<"UserRoleAssignment", 'String'>
    readonly roleId: FieldRef<"UserRoleAssignment", 'String'>
    readonly scopeType: FieldRef<"UserRoleAssignment", 'ScopeType'>
    readonly scopeId: FieldRef<"UserRoleAssignment", 'String'>
    readonly createdAt: FieldRef<"UserRoleAssignment", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * UserRoleAssignment findUnique
   */
  export type UserRoleAssignmentFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter, which UserRoleAssignment to fetch.
     */
    where: UserRoleAssignmentWhereUniqueInput
  }

  /**
   * UserRoleAssignment findUniqueOrThrow
   */
  export type UserRoleAssignmentFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter, which UserRoleAssignment to fetch.
     */
    where: UserRoleAssignmentWhereUniqueInput
  }

  /**
   * UserRoleAssignment findFirst
   */
  export type UserRoleAssignmentFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter, which UserRoleAssignment to fetch.
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserRoleAssignments to fetch.
     */
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserRoleAssignments.
     */
    cursor?: UserRoleAssignmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserRoleAssignments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserRoleAssignments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserRoleAssignments.
     */
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * UserRoleAssignment findFirstOrThrow
   */
  export type UserRoleAssignmentFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter, which UserRoleAssignment to fetch.
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserRoleAssignments to fetch.
     */
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for UserRoleAssignments.
     */
    cursor?: UserRoleAssignmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserRoleAssignments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserRoleAssignments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of UserRoleAssignments.
     */
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * UserRoleAssignment findMany
   */
  export type UserRoleAssignmentFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter, which UserRoleAssignments to fetch.
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of UserRoleAssignments to fetch.
     */
    orderBy?: UserRoleAssignmentOrderByWithRelationInput | UserRoleAssignmentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing UserRoleAssignments.
     */
    cursor?: UserRoleAssignmentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` UserRoleAssignments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` UserRoleAssignments.
     */
    skip?: number
    distinct?: UserRoleAssignmentScalarFieldEnum | UserRoleAssignmentScalarFieldEnum[]
  }

  /**
   * UserRoleAssignment create
   */
  export type UserRoleAssignmentCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * The data needed to create a UserRoleAssignment.
     */
    data: XOR<UserRoleAssignmentCreateInput, UserRoleAssignmentUncheckedCreateInput>
  }

  /**
   * UserRoleAssignment createMany
   */
  export type UserRoleAssignmentCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many UserRoleAssignments.
     */
    data: UserRoleAssignmentCreateManyInput | UserRoleAssignmentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * UserRoleAssignment createManyAndReturn
   */
  export type UserRoleAssignmentCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * The data used to create many UserRoleAssignments.
     */
    data: UserRoleAssignmentCreateManyInput | UserRoleAssignmentCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * UserRoleAssignment update
   */
  export type UserRoleAssignmentUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * The data needed to update a UserRoleAssignment.
     */
    data: XOR<UserRoleAssignmentUpdateInput, UserRoleAssignmentUncheckedUpdateInput>
    /**
     * Choose, which UserRoleAssignment to update.
     */
    where: UserRoleAssignmentWhereUniqueInput
  }

  /**
   * UserRoleAssignment updateMany
   */
  export type UserRoleAssignmentUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update UserRoleAssignments.
     */
    data: XOR<UserRoleAssignmentUpdateManyMutationInput, UserRoleAssignmentUncheckedUpdateManyInput>
    /**
     * Filter which UserRoleAssignments to update
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * Limit how many UserRoleAssignments to update.
     */
    limit?: number
  }

  /**
   * UserRoleAssignment updateManyAndReturn
   */
  export type UserRoleAssignmentUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * The data used to update UserRoleAssignments.
     */
    data: XOR<UserRoleAssignmentUpdateManyMutationInput, UserRoleAssignmentUncheckedUpdateManyInput>
    /**
     * Filter which UserRoleAssignments to update
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * Limit how many UserRoleAssignments to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * UserRoleAssignment upsert
   */
  export type UserRoleAssignmentUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * The filter to search for the UserRoleAssignment to update in case it exists.
     */
    where: UserRoleAssignmentWhereUniqueInput
    /**
     * In case the UserRoleAssignment found by the `where` argument doesn't exist, create a new UserRoleAssignment with this data.
     */
    create: XOR<UserRoleAssignmentCreateInput, UserRoleAssignmentUncheckedCreateInput>
    /**
     * In case the UserRoleAssignment was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserRoleAssignmentUpdateInput, UserRoleAssignmentUncheckedUpdateInput>
  }

  /**
   * UserRoleAssignment delete
   */
  export type UserRoleAssignmentDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
    /**
     * Filter which UserRoleAssignment to delete.
     */
    where: UserRoleAssignmentWhereUniqueInput
  }

  /**
   * UserRoleAssignment deleteMany
   */
  export type UserRoleAssignmentDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which UserRoleAssignments to delete
     */
    where?: UserRoleAssignmentWhereInput
    /**
     * Limit how many UserRoleAssignments to delete.
     */
    limit?: number
  }

  /**
   * UserRoleAssignment without action
   */
  export type UserRoleAssignmentDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserRoleAssignment
     */
    select?: UserRoleAssignmentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the UserRoleAssignment
     */
    omit?: UserRoleAssignmentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserRoleAssignmentInclude<ExtArgs> | null
  }


  /**
   * Model AuditEvent
   */

  export type AggregateAuditEvent = {
    _count: AuditEventCountAggregateOutputType | null
    _min: AuditEventMinAggregateOutputType | null
    _max: AuditEventMaxAggregateOutputType | null
  }

  export type AuditEventMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    actorType: $Enums.ActorType | null
    actorId: string | null
    action: string | null
    objectType: string | null
    objectId: string | null
    occurredAt: Date | null
    correlationId: string | null
    source: string | null
    reason: string | null
  }

  export type AuditEventMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    actorType: $Enums.ActorType | null
    actorId: string | null
    action: string | null
    objectType: string | null
    objectId: string | null
    occurredAt: Date | null
    correlationId: string | null
    source: string | null
    reason: string | null
  }

  export type AuditEventCountAggregateOutputType = {
    id: number
    tenantId: number
    actorType: number
    actorId: number
    action: number
    objectType: number
    objectId: number
    occurredAt: number
    correlationId: number
    source: number
    previousValues: number
    newValues: number
    reason: number
    _all: number
  }


  export type AuditEventMinAggregateInputType = {
    id?: true
    tenantId?: true
    actorType?: true
    actorId?: true
    action?: true
    objectType?: true
    objectId?: true
    occurredAt?: true
    correlationId?: true
    source?: true
    reason?: true
  }

  export type AuditEventMaxAggregateInputType = {
    id?: true
    tenantId?: true
    actorType?: true
    actorId?: true
    action?: true
    objectType?: true
    objectId?: true
    occurredAt?: true
    correlationId?: true
    source?: true
    reason?: true
  }

  export type AuditEventCountAggregateInputType = {
    id?: true
    tenantId?: true
    actorType?: true
    actorId?: true
    action?: true
    objectType?: true
    objectId?: true
    occurredAt?: true
    correlationId?: true
    source?: true
    previousValues?: true
    newValues?: true
    reason?: true
    _all?: true
  }

  export type AuditEventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditEvent to aggregate.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AuditEvents
    **/
    _count?: true | AuditEventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AuditEventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AuditEventMaxAggregateInputType
  }

  export type GetAuditEventAggregateType<T extends AuditEventAggregateArgs> = {
        [P in keyof T & keyof AggregateAuditEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAuditEvent[P]>
      : GetScalarType<T[P], AggregateAuditEvent[P]>
  }




  export type AuditEventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuditEventWhereInput
    orderBy?: AuditEventOrderByWithAggregationInput | AuditEventOrderByWithAggregationInput[]
    by: AuditEventScalarFieldEnum[] | AuditEventScalarFieldEnum
    having?: AuditEventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AuditEventCountAggregateInputType | true
    _min?: AuditEventMinAggregateInputType
    _max?: AuditEventMaxAggregateInputType
  }

  export type AuditEventGroupByOutputType = {
    id: string
    tenantId: string
    actorType: $Enums.ActorType
    actorId: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt: Date
    correlationId: string
    source: string
    previousValues: JsonValue | null
    newValues: JsonValue | null
    reason: string | null
    _count: AuditEventCountAggregateOutputType | null
    _min: AuditEventMinAggregateOutputType | null
    _max: AuditEventMaxAggregateOutputType | null
  }

  type GetAuditEventGroupByPayload<T extends AuditEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AuditEventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AuditEventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AuditEventGroupByOutputType[P]>
            : GetScalarType<T[P], AuditEventGroupByOutputType[P]>
        }
      >
    >


  export type AuditEventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    actorType?: boolean
    actorId?: boolean
    action?: boolean
    objectType?: boolean
    objectId?: boolean
    occurredAt?: boolean
    correlationId?: boolean
    source?: boolean
    previousValues?: boolean
    newValues?: boolean
    reason?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    actorType?: boolean
    actorId?: boolean
    action?: boolean
    objectType?: boolean
    objectId?: boolean
    occurredAt?: boolean
    correlationId?: boolean
    source?: boolean
    previousValues?: boolean
    newValues?: boolean
    reason?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    actorType?: boolean
    actorId?: boolean
    action?: boolean
    objectType?: boolean
    objectId?: boolean
    occurredAt?: boolean
    correlationId?: boolean
    source?: boolean
    previousValues?: boolean
    newValues?: boolean
    reason?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["auditEvent"]>

  export type AuditEventSelectScalar = {
    id?: boolean
    tenantId?: boolean
    actorType?: boolean
    actorId?: boolean
    action?: boolean
    objectType?: boolean
    objectId?: boolean
    occurredAt?: boolean
    correlationId?: boolean
    source?: boolean
    previousValues?: boolean
    newValues?: boolean
    reason?: boolean
  }

  export type AuditEventOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "actorType" | "actorId" | "action" | "objectType" | "objectId" | "occurredAt" | "correlationId" | "source" | "previousValues" | "newValues" | "reason", ExtArgs["result"]["auditEvent"]>
  export type AuditEventInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type AuditEventIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type AuditEventIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $AuditEventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AuditEvent"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      actorType: $Enums.ActorType
      actorId: string | null
      action: string
      objectType: string
      objectId: string
      occurredAt: Date
      correlationId: string
      /**
       * Source channel: api | worker | integration | device | system
       */
      source: string
      previousValues: Prisma.JsonValue | null
      newValues: Prisma.JsonValue | null
      reason: string | null
    }, ExtArgs["result"]["auditEvent"]>
    composites: {}
  }

  type AuditEventGetPayload<S extends boolean | null | undefined | AuditEventDefaultArgs> = $Result.GetResult<Prisma.$AuditEventPayload, S>

  type AuditEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AuditEventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AuditEventCountAggregateInputType | true
    }

  export interface AuditEventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AuditEvent'], meta: { name: 'AuditEvent' } }
    /**
     * Find zero or one AuditEvent that matches the filter.
     * @param {AuditEventFindUniqueArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AuditEventFindUniqueArgs>(args: SelectSubset<T, AuditEventFindUniqueArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AuditEvent that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AuditEventFindUniqueOrThrowArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AuditEventFindUniqueOrThrowArgs>(args: SelectSubset<T, AuditEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindFirstArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AuditEventFindFirstArgs>(args?: SelectSubset<T, AuditEventFindFirstArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuditEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindFirstOrThrowArgs} args - Arguments to find a AuditEvent
     * @example
     * // Get one AuditEvent
     * const auditEvent = await prisma.auditEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AuditEventFindFirstOrThrowArgs>(args?: SelectSubset<T, AuditEventFindFirstOrThrowArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AuditEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AuditEvents
     * const auditEvents = await prisma.auditEvent.findMany()
     * 
     * // Get first 10 AuditEvents
     * const auditEvents = await prisma.auditEvent.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AuditEventFindManyArgs>(args?: SelectSubset<T, AuditEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AuditEvent.
     * @param {AuditEventCreateArgs} args - Arguments to create a AuditEvent.
     * @example
     * // Create one AuditEvent
     * const AuditEvent = await prisma.auditEvent.create({
     *   data: {
     *     // ... data to create a AuditEvent
     *   }
     * })
     * 
     */
    create<T extends AuditEventCreateArgs>(args: SelectSubset<T, AuditEventCreateArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AuditEvents.
     * @param {AuditEventCreateManyArgs} args - Arguments to create many AuditEvents.
     * @example
     * // Create many AuditEvents
     * const auditEvent = await prisma.auditEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AuditEventCreateManyArgs>(args?: SelectSubset<T, AuditEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many AuditEvents and returns the data saved in the database.
     * @param {AuditEventCreateManyAndReturnArgs} args - Arguments to create many AuditEvents.
     * @example
     * // Create many AuditEvents
     * const auditEvent = await prisma.auditEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many AuditEvents and only return the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends AuditEventCreateManyAndReturnArgs>(args?: SelectSubset<T, AuditEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a AuditEvent.
     * @param {AuditEventDeleteArgs} args - Arguments to delete one AuditEvent.
     * @example
     * // Delete one AuditEvent
     * const AuditEvent = await prisma.auditEvent.delete({
     *   where: {
     *     // ... filter to delete one AuditEvent
     *   }
     * })
     * 
     */
    delete<T extends AuditEventDeleteArgs>(args: SelectSubset<T, AuditEventDeleteArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AuditEvent.
     * @param {AuditEventUpdateArgs} args - Arguments to update one AuditEvent.
     * @example
     * // Update one AuditEvent
     * const auditEvent = await prisma.auditEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AuditEventUpdateArgs>(args: SelectSubset<T, AuditEventUpdateArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AuditEvents.
     * @param {AuditEventDeleteManyArgs} args - Arguments to filter AuditEvents to delete.
     * @example
     * // Delete a few AuditEvents
     * const { count } = await prisma.auditEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AuditEventDeleteManyArgs>(args?: SelectSubset<T, AuditEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AuditEvents
     * const auditEvent = await prisma.auditEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AuditEventUpdateManyArgs>(args: SelectSubset<T, AuditEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuditEvents and returns the data updated in the database.
     * @param {AuditEventUpdateManyAndReturnArgs} args - Arguments to update many AuditEvents.
     * @example
     * // Update many AuditEvents
     * const auditEvent = await prisma.auditEvent.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more AuditEvents and only return the `id`
     * const auditEventWithIdOnly = await prisma.auditEvent.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends AuditEventUpdateManyAndReturnArgs>(args: SelectSubset<T, AuditEventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one AuditEvent.
     * @param {AuditEventUpsertArgs} args - Arguments to update or create a AuditEvent.
     * @example
     * // Update or create a AuditEvent
     * const auditEvent = await prisma.auditEvent.upsert({
     *   create: {
     *     // ... data to create a AuditEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AuditEvent we want to update
     *   }
     * })
     */
    upsert<T extends AuditEventUpsertArgs>(args: SelectSubset<T, AuditEventUpsertArgs<ExtArgs>>): Prisma__AuditEventClient<$Result.GetResult<Prisma.$AuditEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AuditEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventCountArgs} args - Arguments to filter AuditEvents to count.
     * @example
     * // Count the number of AuditEvents
     * const count = await prisma.auditEvent.count({
     *   where: {
     *     // ... the filter for the AuditEvents we want to count
     *   }
     * })
    **/
    count<T extends AuditEventCountArgs>(
      args?: Subset<T, AuditEventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AuditEventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AuditEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AuditEventAggregateArgs>(args: Subset<T, AuditEventAggregateArgs>): Prisma.PrismaPromise<GetAuditEventAggregateType<T>>

    /**
     * Group by AuditEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuditEventGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AuditEventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AuditEventGroupByArgs['orderBy'] }
        : { orderBy?: AuditEventGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AuditEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAuditEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AuditEvent model
   */
  readonly fields: AuditEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AuditEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AuditEventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AuditEvent model
   */
  interface AuditEventFieldRefs {
    readonly id: FieldRef<"AuditEvent", 'String'>
    readonly tenantId: FieldRef<"AuditEvent", 'String'>
    readonly actorType: FieldRef<"AuditEvent", 'ActorType'>
    readonly actorId: FieldRef<"AuditEvent", 'String'>
    readonly action: FieldRef<"AuditEvent", 'String'>
    readonly objectType: FieldRef<"AuditEvent", 'String'>
    readonly objectId: FieldRef<"AuditEvent", 'String'>
    readonly occurredAt: FieldRef<"AuditEvent", 'DateTime'>
    readonly correlationId: FieldRef<"AuditEvent", 'String'>
    readonly source: FieldRef<"AuditEvent", 'String'>
    readonly previousValues: FieldRef<"AuditEvent", 'Json'>
    readonly newValues: FieldRef<"AuditEvent", 'Json'>
    readonly reason: FieldRef<"AuditEvent", 'String'>
  }
    

  // Custom InputTypes
  /**
   * AuditEvent findUnique
   */
  export type AuditEventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent findUniqueOrThrow
   */
  export type AuditEventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent findFirst
   */
  export type AuditEventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditEvents.
     */
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent findFirstOrThrow
   */
  export type AuditEventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvent to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuditEvents.
     */
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent findMany
   */
  export type AuditEventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter, which AuditEvents to fetch.
     */
    where?: AuditEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuditEvents to fetch.
     */
    orderBy?: AuditEventOrderByWithRelationInput | AuditEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AuditEvents.
     */
    cursor?: AuditEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuditEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuditEvents.
     */
    skip?: number
    distinct?: AuditEventScalarFieldEnum | AuditEventScalarFieldEnum[]
  }

  /**
   * AuditEvent create
   */
  export type AuditEventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The data needed to create a AuditEvent.
     */
    data: XOR<AuditEventCreateInput, AuditEventUncheckedCreateInput>
  }

  /**
   * AuditEvent createMany
   */
  export type AuditEventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AuditEvents.
     */
    data: AuditEventCreateManyInput | AuditEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuditEvent createManyAndReturn
   */
  export type AuditEventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * The data used to create many AuditEvents.
     */
    data: AuditEventCreateManyInput | AuditEventCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * AuditEvent update
   */
  export type AuditEventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The data needed to update a AuditEvent.
     */
    data: XOR<AuditEventUpdateInput, AuditEventUncheckedUpdateInput>
    /**
     * Choose, which AuditEvent to update.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent updateMany
   */
  export type AuditEventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AuditEvents.
     */
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyInput>
    /**
     * Filter which AuditEvents to update
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to update.
     */
    limit?: number
  }

  /**
   * AuditEvent updateManyAndReturn
   */
  export type AuditEventUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * The data used to update AuditEvents.
     */
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyInput>
    /**
     * Filter which AuditEvents to update
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * AuditEvent upsert
   */
  export type AuditEventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * The filter to search for the AuditEvent to update in case it exists.
     */
    where: AuditEventWhereUniqueInput
    /**
     * In case the AuditEvent found by the `where` argument doesn't exist, create a new AuditEvent with this data.
     */
    create: XOR<AuditEventCreateInput, AuditEventUncheckedCreateInput>
    /**
     * In case the AuditEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AuditEventUpdateInput, AuditEventUncheckedUpdateInput>
  }

  /**
   * AuditEvent delete
   */
  export type AuditEventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
    /**
     * Filter which AuditEvent to delete.
     */
    where: AuditEventWhereUniqueInput
  }

  /**
   * AuditEvent deleteMany
   */
  export type AuditEventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuditEvents to delete
     */
    where?: AuditEventWhereInput
    /**
     * Limit how many AuditEvents to delete.
     */
    limit?: number
  }

  /**
   * AuditEvent without action
   */
  export type AuditEventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuditEvent
     */
    select?: AuditEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuditEvent
     */
    omit?: AuditEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuditEventInclude<ExtArgs> | null
  }


  /**
   * Model OutboxEvent
   */

  export type AggregateOutboxEvent = {
    _count: OutboxEventCountAggregateOutputType | null
    _avg: OutboxEventAvgAggregateOutputType | null
    _sum: OutboxEventSumAggregateOutputType | null
    _min: OutboxEventMinAggregateOutputType | null
    _max: OutboxEventMaxAggregateOutputType | null
  }

  export type OutboxEventAvgAggregateOutputType = {
    eventVersion: number | null
    attempts: number | null
  }

  export type OutboxEventSumAggregateOutputType = {
    eventVersion: number | null
    attempts: number | null
  }

  export type OutboxEventMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    eventType: string | null
    eventVersion: number | null
    aggregateType: string | null
    aggregateId: string | null
    occurredAt: Date | null
    actorType: $Enums.ActorType | null
    actorId: string | null
    correlationId: string | null
    causationId: string | null
    status: $Enums.OutboxStatus | null
    attempts: number | null
    dispatchedAt: Date | null
    lastError: string | null
  }

  export type OutboxEventMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    eventType: string | null
    eventVersion: number | null
    aggregateType: string | null
    aggregateId: string | null
    occurredAt: Date | null
    actorType: $Enums.ActorType | null
    actorId: string | null
    correlationId: string | null
    causationId: string | null
    status: $Enums.OutboxStatus | null
    attempts: number | null
    dispatchedAt: Date | null
    lastError: string | null
  }

  export type OutboxEventCountAggregateOutputType = {
    id: number
    tenantId: number
    eventType: number
    eventVersion: number
    aggregateType: number
    aggregateId: number
    occurredAt: number
    actorType: number
    actorId: number
    correlationId: number
    causationId: number
    payload: number
    status: number
    attempts: number
    dispatchedAt: number
    lastError: number
    _all: number
  }


  export type OutboxEventAvgAggregateInputType = {
    eventVersion?: true
    attempts?: true
  }

  export type OutboxEventSumAggregateInputType = {
    eventVersion?: true
    attempts?: true
  }

  export type OutboxEventMinAggregateInputType = {
    id?: true
    tenantId?: true
    eventType?: true
    eventVersion?: true
    aggregateType?: true
    aggregateId?: true
    occurredAt?: true
    actorType?: true
    actorId?: true
    correlationId?: true
    causationId?: true
    status?: true
    attempts?: true
    dispatchedAt?: true
    lastError?: true
  }

  export type OutboxEventMaxAggregateInputType = {
    id?: true
    tenantId?: true
    eventType?: true
    eventVersion?: true
    aggregateType?: true
    aggregateId?: true
    occurredAt?: true
    actorType?: true
    actorId?: true
    correlationId?: true
    causationId?: true
    status?: true
    attempts?: true
    dispatchedAt?: true
    lastError?: true
  }

  export type OutboxEventCountAggregateInputType = {
    id?: true
    tenantId?: true
    eventType?: true
    eventVersion?: true
    aggregateType?: true
    aggregateId?: true
    occurredAt?: true
    actorType?: true
    actorId?: true
    correlationId?: true
    causationId?: true
    payload?: true
    status?: true
    attempts?: true
    dispatchedAt?: true
    lastError?: true
    _all?: true
  }

  export type OutboxEventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OutboxEvent to aggregate.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned OutboxEvents
    **/
    _count?: true | OutboxEventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OutboxEventAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OutboxEventSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OutboxEventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OutboxEventMaxAggregateInputType
  }

  export type GetOutboxEventAggregateType<T extends OutboxEventAggregateArgs> = {
        [P in keyof T & keyof AggregateOutboxEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOutboxEvent[P]>
      : GetScalarType<T[P], AggregateOutboxEvent[P]>
  }




  export type OutboxEventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OutboxEventWhereInput
    orderBy?: OutboxEventOrderByWithAggregationInput | OutboxEventOrderByWithAggregationInput[]
    by: OutboxEventScalarFieldEnum[] | OutboxEventScalarFieldEnum
    having?: OutboxEventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OutboxEventCountAggregateInputType | true
    _avg?: OutboxEventAvgAggregateInputType
    _sum?: OutboxEventSumAggregateInputType
    _min?: OutboxEventMinAggregateInputType
    _max?: OutboxEventMaxAggregateInputType
  }

  export type OutboxEventGroupByOutputType = {
    id: string
    tenantId: string
    eventType: string
    eventVersion: number
    aggregateType: string
    aggregateId: string
    occurredAt: Date
    actorType: $Enums.ActorType
    actorId: string | null
    correlationId: string
    causationId: string | null
    payload: JsonValue
    status: $Enums.OutboxStatus
    attempts: number
    dispatchedAt: Date | null
    lastError: string | null
    _count: OutboxEventCountAggregateOutputType | null
    _avg: OutboxEventAvgAggregateOutputType | null
    _sum: OutboxEventSumAggregateOutputType | null
    _min: OutboxEventMinAggregateOutputType | null
    _max: OutboxEventMaxAggregateOutputType | null
  }

  type GetOutboxEventGroupByPayload<T extends OutboxEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OutboxEventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OutboxEventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OutboxEventGroupByOutputType[P]>
            : GetScalarType<T[P], OutboxEventGroupByOutputType[P]>
        }
      >
    >


  export type OutboxEventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    eventType?: boolean
    eventVersion?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    occurredAt?: boolean
    actorType?: boolean
    actorId?: boolean
    correlationId?: boolean
    causationId?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    dispatchedAt?: boolean
    lastError?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["outboxEvent"]>

  export type OutboxEventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    eventType?: boolean
    eventVersion?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    occurredAt?: boolean
    actorType?: boolean
    actorId?: boolean
    correlationId?: boolean
    causationId?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    dispatchedAt?: boolean
    lastError?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["outboxEvent"]>

  export type OutboxEventSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    eventType?: boolean
    eventVersion?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    occurredAt?: boolean
    actorType?: boolean
    actorId?: boolean
    correlationId?: boolean
    causationId?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    dispatchedAt?: boolean
    lastError?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["outboxEvent"]>

  export type OutboxEventSelectScalar = {
    id?: boolean
    tenantId?: boolean
    eventType?: boolean
    eventVersion?: boolean
    aggregateType?: boolean
    aggregateId?: boolean
    occurredAt?: boolean
    actorType?: boolean
    actorId?: boolean
    correlationId?: boolean
    causationId?: boolean
    payload?: boolean
    status?: boolean
    attempts?: boolean
    dispatchedAt?: boolean
    lastError?: boolean
  }

  export type OutboxEventOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "eventType" | "eventVersion" | "aggregateType" | "aggregateId" | "occurredAt" | "actorType" | "actorId" | "correlationId" | "causationId" | "payload" | "status" | "attempts" | "dispatchedAt" | "lastError", ExtArgs["result"]["outboxEvent"]>
  export type OutboxEventInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type OutboxEventIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }
  export type OutboxEventIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $OutboxEventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "OutboxEvent"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      eventType: string
      eventVersion: number
      aggregateType: string
      aggregateId: string
      occurredAt: Date
      actorType: $Enums.ActorType
      actorId: string | null
      correlationId: string
      causationId: string | null
      payload: Prisma.JsonValue
      status: $Enums.OutboxStatus
      attempts: number
      dispatchedAt: Date | null
      lastError: string | null
    }, ExtArgs["result"]["outboxEvent"]>
    composites: {}
  }

  type OutboxEventGetPayload<S extends boolean | null | undefined | OutboxEventDefaultArgs> = $Result.GetResult<Prisma.$OutboxEventPayload, S>

  type OutboxEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OutboxEventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OutboxEventCountAggregateInputType | true
    }

  export interface OutboxEventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['OutboxEvent'], meta: { name: 'OutboxEvent' } }
    /**
     * Find zero or one OutboxEvent that matches the filter.
     * @param {OutboxEventFindUniqueArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OutboxEventFindUniqueArgs>(args: SelectSubset<T, OutboxEventFindUniqueArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one OutboxEvent that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OutboxEventFindUniqueOrThrowArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OutboxEventFindUniqueOrThrowArgs>(args: SelectSubset<T, OutboxEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OutboxEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindFirstArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OutboxEventFindFirstArgs>(args?: SelectSubset<T, OutboxEventFindFirstArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OutboxEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindFirstOrThrowArgs} args - Arguments to find a OutboxEvent
     * @example
     * // Get one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OutboxEventFindFirstOrThrowArgs>(args?: SelectSubset<T, OutboxEventFindFirstOrThrowArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more OutboxEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all OutboxEvents
     * const outboxEvents = await prisma.outboxEvent.findMany()
     * 
     * // Get first 10 OutboxEvents
     * const outboxEvents = await prisma.outboxEvent.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const outboxEventWithIdOnly = await prisma.outboxEvent.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OutboxEventFindManyArgs>(args?: SelectSubset<T, OutboxEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a OutboxEvent.
     * @param {OutboxEventCreateArgs} args - Arguments to create a OutboxEvent.
     * @example
     * // Create one OutboxEvent
     * const OutboxEvent = await prisma.outboxEvent.create({
     *   data: {
     *     // ... data to create a OutboxEvent
     *   }
     * })
     * 
     */
    create<T extends OutboxEventCreateArgs>(args: SelectSubset<T, OutboxEventCreateArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many OutboxEvents.
     * @param {OutboxEventCreateManyArgs} args - Arguments to create many OutboxEvents.
     * @example
     * // Create many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OutboxEventCreateManyArgs>(args?: SelectSubset<T, OutboxEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many OutboxEvents and returns the data saved in the database.
     * @param {OutboxEventCreateManyAndReturnArgs} args - Arguments to create many OutboxEvents.
     * @example
     * // Create many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many OutboxEvents and only return the `id`
     * const outboxEventWithIdOnly = await prisma.outboxEvent.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends OutboxEventCreateManyAndReturnArgs>(args?: SelectSubset<T, OutboxEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a OutboxEvent.
     * @param {OutboxEventDeleteArgs} args - Arguments to delete one OutboxEvent.
     * @example
     * // Delete one OutboxEvent
     * const OutboxEvent = await prisma.outboxEvent.delete({
     *   where: {
     *     // ... filter to delete one OutboxEvent
     *   }
     * })
     * 
     */
    delete<T extends OutboxEventDeleteArgs>(args: SelectSubset<T, OutboxEventDeleteArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one OutboxEvent.
     * @param {OutboxEventUpdateArgs} args - Arguments to update one OutboxEvent.
     * @example
     * // Update one OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OutboxEventUpdateArgs>(args: SelectSubset<T, OutboxEventUpdateArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more OutboxEvents.
     * @param {OutboxEventDeleteManyArgs} args - Arguments to filter OutboxEvents to delete.
     * @example
     * // Delete a few OutboxEvents
     * const { count } = await prisma.outboxEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OutboxEventDeleteManyArgs>(args?: SelectSubset<T, OutboxEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OutboxEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OutboxEventUpdateManyArgs>(args: SelectSubset<T, OutboxEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OutboxEvents and returns the data updated in the database.
     * @param {OutboxEventUpdateManyAndReturnArgs} args - Arguments to update many OutboxEvents.
     * @example
     * // Update many OutboxEvents
     * const outboxEvent = await prisma.outboxEvent.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more OutboxEvents and only return the `id`
     * const outboxEventWithIdOnly = await prisma.outboxEvent.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends OutboxEventUpdateManyAndReturnArgs>(args: SelectSubset<T, OutboxEventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one OutboxEvent.
     * @param {OutboxEventUpsertArgs} args - Arguments to update or create a OutboxEvent.
     * @example
     * // Update or create a OutboxEvent
     * const outboxEvent = await prisma.outboxEvent.upsert({
     *   create: {
     *     // ... data to create a OutboxEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the OutboxEvent we want to update
     *   }
     * })
     */
    upsert<T extends OutboxEventUpsertArgs>(args: SelectSubset<T, OutboxEventUpsertArgs<ExtArgs>>): Prisma__OutboxEventClient<$Result.GetResult<Prisma.$OutboxEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of OutboxEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventCountArgs} args - Arguments to filter OutboxEvents to count.
     * @example
     * // Count the number of OutboxEvents
     * const count = await prisma.outboxEvent.count({
     *   where: {
     *     // ... the filter for the OutboxEvents we want to count
     *   }
     * })
    **/
    count<T extends OutboxEventCountArgs>(
      args?: Subset<T, OutboxEventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OutboxEventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a OutboxEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OutboxEventAggregateArgs>(args: Subset<T, OutboxEventAggregateArgs>): Prisma.PrismaPromise<GetOutboxEventAggregateType<T>>

    /**
     * Group by OutboxEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OutboxEventGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OutboxEventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OutboxEventGroupByArgs['orderBy'] }
        : { orderBy?: OutboxEventGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OutboxEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOutboxEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the OutboxEvent model
   */
  readonly fields: OutboxEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for OutboxEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OutboxEventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the OutboxEvent model
   */
  interface OutboxEventFieldRefs {
    readonly id: FieldRef<"OutboxEvent", 'String'>
    readonly tenantId: FieldRef<"OutboxEvent", 'String'>
    readonly eventType: FieldRef<"OutboxEvent", 'String'>
    readonly eventVersion: FieldRef<"OutboxEvent", 'Int'>
    readonly aggregateType: FieldRef<"OutboxEvent", 'String'>
    readonly aggregateId: FieldRef<"OutboxEvent", 'String'>
    readonly occurredAt: FieldRef<"OutboxEvent", 'DateTime'>
    readonly actorType: FieldRef<"OutboxEvent", 'ActorType'>
    readonly actorId: FieldRef<"OutboxEvent", 'String'>
    readonly correlationId: FieldRef<"OutboxEvent", 'String'>
    readonly causationId: FieldRef<"OutboxEvent", 'String'>
    readonly payload: FieldRef<"OutboxEvent", 'Json'>
    readonly status: FieldRef<"OutboxEvent", 'OutboxStatus'>
    readonly attempts: FieldRef<"OutboxEvent", 'Int'>
    readonly dispatchedAt: FieldRef<"OutboxEvent", 'DateTime'>
    readonly lastError: FieldRef<"OutboxEvent", 'String'>
  }
    

  // Custom InputTypes
  /**
   * OutboxEvent findUnique
   */
  export type OutboxEventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent findUniqueOrThrow
   */
  export type OutboxEventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent findFirst
   */
  export type OutboxEventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OutboxEvents.
     */
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent findFirstOrThrow
   */
  export type OutboxEventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter, which OutboxEvent to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OutboxEvents.
     */
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent findMany
   */
  export type OutboxEventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter, which OutboxEvents to fetch.
     */
    where?: OutboxEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OutboxEvents to fetch.
     */
    orderBy?: OutboxEventOrderByWithRelationInput | OutboxEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing OutboxEvents.
     */
    cursor?: OutboxEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OutboxEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OutboxEvents.
     */
    skip?: number
    distinct?: OutboxEventScalarFieldEnum | OutboxEventScalarFieldEnum[]
  }

  /**
   * OutboxEvent create
   */
  export type OutboxEventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * The data needed to create a OutboxEvent.
     */
    data: XOR<OutboxEventCreateInput, OutboxEventUncheckedCreateInput>
  }

  /**
   * OutboxEvent createMany
   */
  export type OutboxEventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many OutboxEvents.
     */
    data: OutboxEventCreateManyInput | OutboxEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OutboxEvent createManyAndReturn
   */
  export type OutboxEventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * The data used to create many OutboxEvents.
     */
    data: OutboxEventCreateManyInput | OutboxEventCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * OutboxEvent update
   */
  export type OutboxEventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * The data needed to update a OutboxEvent.
     */
    data: XOR<OutboxEventUpdateInput, OutboxEventUncheckedUpdateInput>
    /**
     * Choose, which OutboxEvent to update.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent updateMany
   */
  export type OutboxEventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update OutboxEvents.
     */
    data: XOR<OutboxEventUpdateManyMutationInput, OutboxEventUncheckedUpdateManyInput>
    /**
     * Filter which OutboxEvents to update
     */
    where?: OutboxEventWhereInput
    /**
     * Limit how many OutboxEvents to update.
     */
    limit?: number
  }

  /**
   * OutboxEvent updateManyAndReturn
   */
  export type OutboxEventUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * The data used to update OutboxEvents.
     */
    data: XOR<OutboxEventUpdateManyMutationInput, OutboxEventUncheckedUpdateManyInput>
    /**
     * Filter which OutboxEvents to update
     */
    where?: OutboxEventWhereInput
    /**
     * Limit how many OutboxEvents to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * OutboxEvent upsert
   */
  export type OutboxEventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * The filter to search for the OutboxEvent to update in case it exists.
     */
    where: OutboxEventWhereUniqueInput
    /**
     * In case the OutboxEvent found by the `where` argument doesn't exist, create a new OutboxEvent with this data.
     */
    create: XOR<OutboxEventCreateInput, OutboxEventUncheckedCreateInput>
    /**
     * In case the OutboxEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OutboxEventUpdateInput, OutboxEventUncheckedUpdateInput>
  }

  /**
   * OutboxEvent delete
   */
  export type OutboxEventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
    /**
     * Filter which OutboxEvent to delete.
     */
    where: OutboxEventWhereUniqueInput
  }

  /**
   * OutboxEvent deleteMany
   */
  export type OutboxEventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OutboxEvents to delete
     */
    where?: OutboxEventWhereInput
    /**
     * Limit how many OutboxEvents to delete.
     */
    limit?: number
  }

  /**
   * OutboxEvent without action
   */
  export type OutboxEventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OutboxEvent
     */
    select?: OutboxEventSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OutboxEvent
     */
    omit?: OutboxEventOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OutboxEventInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const TenantScalarFieldEnum: {
    id: 'id',
    slug: 'slug',
    name: 'name',
    status: 'status',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type TenantScalarFieldEnum = (typeof TenantScalarFieldEnum)[keyof typeof TenantScalarFieldEnum]


  export const TenantConfigurationVersionScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    version: 'version',
    config: 'config',
    publishedAt: 'publishedAt',
    publishedBy: 'publishedBy'
  };

  export type TenantConfigurationVersionScalarFieldEnum = (typeof TenantConfigurationVersionScalarFieldEnum)[keyof typeof TenantConfigurationVersionScalarFieldEnum]


  export const LegalEntityScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    code: 'code',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type LegalEntityScalarFieldEnum = (typeof LegalEntityScalarFieldEnum)[keyof typeof LegalEntityScalarFieldEnum]


  export const BusinessUnitScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    legalEntityId: 'legalEntityId',
    parentId: 'parentId',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type BusinessUnitScalarFieldEnum = (typeof BusinessUnitScalarFieldEnum)[keyof typeof BusinessUnitScalarFieldEnum]


  export const BranchScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    businessUnitId: 'businessUnitId',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type BranchScalarFieldEnum = (typeof BranchScalarFieldEnum)[keyof typeof BranchScalarFieldEnum]


  export const FactoryScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    businessUnitId: 'businessUnitId',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type FactoryScalarFieldEnum = (typeof FactoryScalarFieldEnum)[keyof typeof FactoryScalarFieldEnum]


  export const UserScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    email: 'email',
    displayName: 'displayName',
    status: 'status',
    idpSubject: 'idpSubject',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const RoleScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    description: 'description',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type RoleScalarFieldEnum = (typeof RoleScalarFieldEnum)[keyof typeof RoleScalarFieldEnum]


  export const RolePermissionScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    roleId: 'roleId',
    permissionKey: 'permissionKey'
  };

  export type RolePermissionScalarFieldEnum = (typeof RolePermissionScalarFieldEnum)[keyof typeof RolePermissionScalarFieldEnum]


  export const UserRoleAssignmentScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    userId: 'userId',
    roleId: 'roleId',
    scopeType: 'scopeType',
    scopeId: 'scopeId',
    createdAt: 'createdAt'
  };

  export type UserRoleAssignmentScalarFieldEnum = (typeof UserRoleAssignmentScalarFieldEnum)[keyof typeof UserRoleAssignmentScalarFieldEnum]


  export const AuditEventScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    actorType: 'actorType',
    actorId: 'actorId',
    action: 'action',
    objectType: 'objectType',
    objectId: 'objectId',
    occurredAt: 'occurredAt',
    correlationId: 'correlationId',
    source: 'source',
    previousValues: 'previousValues',
    newValues: 'newValues',
    reason: 'reason'
  };

  export type AuditEventScalarFieldEnum = (typeof AuditEventScalarFieldEnum)[keyof typeof AuditEventScalarFieldEnum]


  export const OutboxEventScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    eventType: 'eventType',
    eventVersion: 'eventVersion',
    aggregateType: 'aggregateType',
    aggregateId: 'aggregateId',
    occurredAt: 'occurredAt',
    actorType: 'actorType',
    actorId: 'actorId',
    correlationId: 'correlationId',
    causationId: 'causationId',
    payload: 'payload',
    status: 'status',
    attempts: 'attempts',
    dispatchedAt: 'dispatchedAt',
    lastError: 'lastError'
  };

  export type OutboxEventScalarFieldEnum = (typeof OutboxEventScalarFieldEnum)[keyof typeof OutboxEventScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'TenantStatus'
   */
  export type EnumTenantStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TenantStatus'>
    


  /**
   * Reference to a field of type 'TenantStatus[]'
   */
  export type ListEnumTenantStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TenantStatus[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'UserStatus'
   */
  export type EnumUserStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'UserStatus'>
    


  /**
   * Reference to a field of type 'UserStatus[]'
   */
  export type ListEnumUserStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'UserStatus[]'>
    


  /**
   * Reference to a field of type 'ScopeType'
   */
  export type EnumScopeTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ScopeType'>
    


  /**
   * Reference to a field of type 'ScopeType[]'
   */
  export type ListEnumScopeTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ScopeType[]'>
    


  /**
   * Reference to a field of type 'ActorType'
   */
  export type EnumActorTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ActorType'>
    


  /**
   * Reference to a field of type 'ActorType[]'
   */
  export type ListEnumActorTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ActorType[]'>
    


  /**
   * Reference to a field of type 'OutboxStatus'
   */
  export type EnumOutboxStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'OutboxStatus'>
    


  /**
   * Reference to a field of type 'OutboxStatus[]'
   */
  export type ListEnumOutboxStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'OutboxStatus[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type TenantWhereInput = {
    AND?: TenantWhereInput | TenantWhereInput[]
    OR?: TenantWhereInput[]
    NOT?: TenantWhereInput | TenantWhereInput[]
    id?: UuidFilter<"Tenant"> | string
    slug?: StringFilter<"Tenant"> | string
    name?: StringFilter<"Tenant"> | string
    status?: EnumTenantStatusFilter<"Tenant"> | $Enums.TenantStatus
    version?: IntFilter<"Tenant"> | number
    createdAt?: DateTimeFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeFilter<"Tenant"> | Date | string
    configurationVersions?: TenantConfigurationVersionListRelationFilter
    legalEntities?: LegalEntityListRelationFilter
    businessUnits?: BusinessUnitListRelationFilter
    branches?: BranchListRelationFilter
    factories?: FactoryListRelationFilter
    users?: UserListRelationFilter
    roles?: RoleListRelationFilter
    roleAssignments?: UserRoleAssignmentListRelationFilter
    auditEvents?: AuditEventListRelationFilter
    outboxEvents?: OutboxEventListRelationFilter
  }

  export type TenantOrderByWithRelationInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    status?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    configurationVersions?: TenantConfigurationVersionOrderByRelationAggregateInput
    legalEntities?: LegalEntityOrderByRelationAggregateInput
    businessUnits?: BusinessUnitOrderByRelationAggregateInput
    branches?: BranchOrderByRelationAggregateInput
    factories?: FactoryOrderByRelationAggregateInput
    users?: UserOrderByRelationAggregateInput
    roles?: RoleOrderByRelationAggregateInput
    roleAssignments?: UserRoleAssignmentOrderByRelationAggregateInput
    auditEvents?: AuditEventOrderByRelationAggregateInput
    outboxEvents?: OutboxEventOrderByRelationAggregateInput
  }

  export type TenantWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    slug?: string
    AND?: TenantWhereInput | TenantWhereInput[]
    OR?: TenantWhereInput[]
    NOT?: TenantWhereInput | TenantWhereInput[]
    name?: StringFilter<"Tenant"> | string
    status?: EnumTenantStatusFilter<"Tenant"> | $Enums.TenantStatus
    version?: IntFilter<"Tenant"> | number
    createdAt?: DateTimeFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeFilter<"Tenant"> | Date | string
    configurationVersions?: TenantConfigurationVersionListRelationFilter
    legalEntities?: LegalEntityListRelationFilter
    businessUnits?: BusinessUnitListRelationFilter
    branches?: BranchListRelationFilter
    factories?: FactoryListRelationFilter
    users?: UserListRelationFilter
    roles?: RoleListRelationFilter
    roleAssignments?: UserRoleAssignmentListRelationFilter
    auditEvents?: AuditEventListRelationFilter
    outboxEvents?: OutboxEventListRelationFilter
  }, "id" | "slug">

  export type TenantOrderByWithAggregationInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    status?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: TenantCountOrderByAggregateInput
    _avg?: TenantAvgOrderByAggregateInput
    _max?: TenantMaxOrderByAggregateInput
    _min?: TenantMinOrderByAggregateInput
    _sum?: TenantSumOrderByAggregateInput
  }

  export type TenantScalarWhereWithAggregatesInput = {
    AND?: TenantScalarWhereWithAggregatesInput | TenantScalarWhereWithAggregatesInput[]
    OR?: TenantScalarWhereWithAggregatesInput[]
    NOT?: TenantScalarWhereWithAggregatesInput | TenantScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Tenant"> | string
    slug?: StringWithAggregatesFilter<"Tenant"> | string
    name?: StringWithAggregatesFilter<"Tenant"> | string
    status?: EnumTenantStatusWithAggregatesFilter<"Tenant"> | $Enums.TenantStatus
    version?: IntWithAggregatesFilter<"Tenant"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Tenant"> | Date | string
  }

  export type TenantConfigurationVersionWhereInput = {
    AND?: TenantConfigurationVersionWhereInput | TenantConfigurationVersionWhereInput[]
    OR?: TenantConfigurationVersionWhereInput[]
    NOT?: TenantConfigurationVersionWhereInput | TenantConfigurationVersionWhereInput[]
    id?: UuidFilter<"TenantConfigurationVersion"> | string
    tenantId?: UuidFilter<"TenantConfigurationVersion"> | string
    version?: IntFilter<"TenantConfigurationVersion"> | number
    config?: JsonFilter<"TenantConfigurationVersion">
    publishedAt?: DateTimeFilter<"TenantConfigurationVersion"> | Date | string
    publishedBy?: UuidNullableFilter<"TenantConfigurationVersion"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }

  export type TenantConfigurationVersionOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    version?: SortOrder
    config?: SortOrder
    publishedAt?: SortOrder
    publishedBy?: SortOrderInput | SortOrder
    tenant?: TenantOrderByWithRelationInput
  }

  export type TenantConfigurationVersionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_version?: TenantConfigurationVersionTenantIdVersionCompoundUniqueInput
    AND?: TenantConfigurationVersionWhereInput | TenantConfigurationVersionWhereInput[]
    OR?: TenantConfigurationVersionWhereInput[]
    NOT?: TenantConfigurationVersionWhereInput | TenantConfigurationVersionWhereInput[]
    tenantId?: UuidFilter<"TenantConfigurationVersion"> | string
    version?: IntFilter<"TenantConfigurationVersion"> | number
    config?: JsonFilter<"TenantConfigurationVersion">
    publishedAt?: DateTimeFilter<"TenantConfigurationVersion"> | Date | string
    publishedBy?: UuidNullableFilter<"TenantConfigurationVersion"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }, "id" | "tenantId_version">

  export type TenantConfigurationVersionOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    version?: SortOrder
    config?: SortOrder
    publishedAt?: SortOrder
    publishedBy?: SortOrderInput | SortOrder
    _count?: TenantConfigurationVersionCountOrderByAggregateInput
    _avg?: TenantConfigurationVersionAvgOrderByAggregateInput
    _max?: TenantConfigurationVersionMaxOrderByAggregateInput
    _min?: TenantConfigurationVersionMinOrderByAggregateInput
    _sum?: TenantConfigurationVersionSumOrderByAggregateInput
  }

  export type TenantConfigurationVersionScalarWhereWithAggregatesInput = {
    AND?: TenantConfigurationVersionScalarWhereWithAggregatesInput | TenantConfigurationVersionScalarWhereWithAggregatesInput[]
    OR?: TenantConfigurationVersionScalarWhereWithAggregatesInput[]
    NOT?: TenantConfigurationVersionScalarWhereWithAggregatesInput | TenantConfigurationVersionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"TenantConfigurationVersion"> | string
    tenantId?: UuidWithAggregatesFilter<"TenantConfigurationVersion"> | string
    version?: IntWithAggregatesFilter<"TenantConfigurationVersion"> | number
    config?: JsonWithAggregatesFilter<"TenantConfigurationVersion">
    publishedAt?: DateTimeWithAggregatesFilter<"TenantConfigurationVersion"> | Date | string
    publishedBy?: UuidNullableWithAggregatesFilter<"TenantConfigurationVersion"> | string | null
  }

  export type LegalEntityWhereInput = {
    AND?: LegalEntityWhereInput | LegalEntityWhereInput[]
    OR?: LegalEntityWhereInput[]
    NOT?: LegalEntityWhereInput | LegalEntityWhereInput[]
    id?: UuidFilter<"LegalEntity"> | string
    tenantId?: UuidFilter<"LegalEntity"> | string
    name?: StringFilter<"LegalEntity"> | string
    code?: StringNullableFilter<"LegalEntity"> | string | null
    createdAt?: DateTimeFilter<"LegalEntity"> | Date | string
    updatedAt?: DateTimeFilter<"LegalEntity"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnits?: BusinessUnitListRelationFilter
  }

  export type LegalEntityOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    code?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    businessUnits?: BusinessUnitOrderByRelationAggregateInput
  }

  export type LegalEntityWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_name?: LegalEntityTenantIdNameCompoundUniqueInput
    AND?: LegalEntityWhereInput | LegalEntityWhereInput[]
    OR?: LegalEntityWhereInput[]
    NOT?: LegalEntityWhereInput | LegalEntityWhereInput[]
    tenantId?: UuidFilter<"LegalEntity"> | string
    name?: StringFilter<"LegalEntity"> | string
    code?: StringNullableFilter<"LegalEntity"> | string | null
    createdAt?: DateTimeFilter<"LegalEntity"> | Date | string
    updatedAt?: DateTimeFilter<"LegalEntity"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnits?: BusinessUnitListRelationFilter
  }, "id" | "tenantId_name">

  export type LegalEntityOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    code?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: LegalEntityCountOrderByAggregateInput
    _max?: LegalEntityMaxOrderByAggregateInput
    _min?: LegalEntityMinOrderByAggregateInput
  }

  export type LegalEntityScalarWhereWithAggregatesInput = {
    AND?: LegalEntityScalarWhereWithAggregatesInput | LegalEntityScalarWhereWithAggregatesInput[]
    OR?: LegalEntityScalarWhereWithAggregatesInput[]
    NOT?: LegalEntityScalarWhereWithAggregatesInput | LegalEntityScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"LegalEntity"> | string
    tenantId?: UuidWithAggregatesFilter<"LegalEntity"> | string
    name?: StringWithAggregatesFilter<"LegalEntity"> | string
    code?: StringNullableWithAggregatesFilter<"LegalEntity"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"LegalEntity"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"LegalEntity"> | Date | string
  }

  export type BusinessUnitWhereInput = {
    AND?: BusinessUnitWhereInput | BusinessUnitWhereInput[]
    OR?: BusinessUnitWhereInput[]
    NOT?: BusinessUnitWhereInput | BusinessUnitWhereInput[]
    id?: UuidFilter<"BusinessUnit"> | string
    tenantId?: UuidFilter<"BusinessUnit"> | string
    legalEntityId?: UuidFilter<"BusinessUnit"> | string
    parentId?: UuidNullableFilter<"BusinessUnit"> | string | null
    name?: StringFilter<"BusinessUnit"> | string
    createdAt?: DateTimeFilter<"BusinessUnit"> | Date | string
    updatedAt?: DateTimeFilter<"BusinessUnit"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    legalEntity?: XOR<LegalEntityScalarRelationFilter, LegalEntityWhereInput>
    parent?: XOR<BusinessUnitNullableScalarRelationFilter, BusinessUnitWhereInput> | null
    children?: BusinessUnitListRelationFilter
    branches?: BranchListRelationFilter
    factories?: FactoryListRelationFilter
  }

  export type BusinessUnitOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    legalEntityId?: SortOrder
    parentId?: SortOrderInput | SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    legalEntity?: LegalEntityOrderByWithRelationInput
    parent?: BusinessUnitOrderByWithRelationInput
    children?: BusinessUnitOrderByRelationAggregateInput
    branches?: BranchOrderByRelationAggregateInput
    factories?: FactoryOrderByRelationAggregateInput
  }

  export type BusinessUnitWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_legalEntityId_name?: BusinessUnitTenantIdLegalEntityIdNameCompoundUniqueInput
    AND?: BusinessUnitWhereInput | BusinessUnitWhereInput[]
    OR?: BusinessUnitWhereInput[]
    NOT?: BusinessUnitWhereInput | BusinessUnitWhereInput[]
    tenantId?: UuidFilter<"BusinessUnit"> | string
    legalEntityId?: UuidFilter<"BusinessUnit"> | string
    parentId?: UuidNullableFilter<"BusinessUnit"> | string | null
    name?: StringFilter<"BusinessUnit"> | string
    createdAt?: DateTimeFilter<"BusinessUnit"> | Date | string
    updatedAt?: DateTimeFilter<"BusinessUnit"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    legalEntity?: XOR<LegalEntityScalarRelationFilter, LegalEntityWhereInput>
    parent?: XOR<BusinessUnitNullableScalarRelationFilter, BusinessUnitWhereInput> | null
    children?: BusinessUnitListRelationFilter
    branches?: BranchListRelationFilter
    factories?: FactoryListRelationFilter
  }, "id" | "tenantId_legalEntityId_name">

  export type BusinessUnitOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    legalEntityId?: SortOrder
    parentId?: SortOrderInput | SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: BusinessUnitCountOrderByAggregateInput
    _max?: BusinessUnitMaxOrderByAggregateInput
    _min?: BusinessUnitMinOrderByAggregateInput
  }

  export type BusinessUnitScalarWhereWithAggregatesInput = {
    AND?: BusinessUnitScalarWhereWithAggregatesInput | BusinessUnitScalarWhereWithAggregatesInput[]
    OR?: BusinessUnitScalarWhereWithAggregatesInput[]
    NOT?: BusinessUnitScalarWhereWithAggregatesInput | BusinessUnitScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"BusinessUnit"> | string
    tenantId?: UuidWithAggregatesFilter<"BusinessUnit"> | string
    legalEntityId?: UuidWithAggregatesFilter<"BusinessUnit"> | string
    parentId?: UuidNullableWithAggregatesFilter<"BusinessUnit"> | string | null
    name?: StringWithAggregatesFilter<"BusinessUnit"> | string
    createdAt?: DateTimeWithAggregatesFilter<"BusinessUnit"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"BusinessUnit"> | Date | string
  }

  export type BranchWhereInput = {
    AND?: BranchWhereInput | BranchWhereInput[]
    OR?: BranchWhereInput[]
    NOT?: BranchWhereInput | BranchWhereInput[]
    id?: UuidFilter<"Branch"> | string
    tenantId?: UuidFilter<"Branch"> | string
    businessUnitId?: UuidFilter<"Branch"> | string
    name?: StringFilter<"Branch"> | string
    createdAt?: DateTimeFilter<"Branch"> | Date | string
    updatedAt?: DateTimeFilter<"Branch"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnit?: XOR<BusinessUnitScalarRelationFilter, BusinessUnitWhereInput>
  }

  export type BranchOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    businessUnit?: BusinessUnitOrderByWithRelationInput
  }

  export type BranchWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_businessUnitId_name?: BranchTenantIdBusinessUnitIdNameCompoundUniqueInput
    AND?: BranchWhereInput | BranchWhereInput[]
    OR?: BranchWhereInput[]
    NOT?: BranchWhereInput | BranchWhereInput[]
    tenantId?: UuidFilter<"Branch"> | string
    businessUnitId?: UuidFilter<"Branch"> | string
    name?: StringFilter<"Branch"> | string
    createdAt?: DateTimeFilter<"Branch"> | Date | string
    updatedAt?: DateTimeFilter<"Branch"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnit?: XOR<BusinessUnitScalarRelationFilter, BusinessUnitWhereInput>
  }, "id" | "tenantId_businessUnitId_name">

  export type BranchOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: BranchCountOrderByAggregateInput
    _max?: BranchMaxOrderByAggregateInput
    _min?: BranchMinOrderByAggregateInput
  }

  export type BranchScalarWhereWithAggregatesInput = {
    AND?: BranchScalarWhereWithAggregatesInput | BranchScalarWhereWithAggregatesInput[]
    OR?: BranchScalarWhereWithAggregatesInput[]
    NOT?: BranchScalarWhereWithAggregatesInput | BranchScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Branch"> | string
    tenantId?: UuidWithAggregatesFilter<"Branch"> | string
    businessUnitId?: UuidWithAggregatesFilter<"Branch"> | string
    name?: StringWithAggregatesFilter<"Branch"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Branch"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Branch"> | Date | string
  }

  export type FactoryWhereInput = {
    AND?: FactoryWhereInput | FactoryWhereInput[]
    OR?: FactoryWhereInput[]
    NOT?: FactoryWhereInput | FactoryWhereInput[]
    id?: UuidFilter<"Factory"> | string
    tenantId?: UuidFilter<"Factory"> | string
    businessUnitId?: UuidFilter<"Factory"> | string
    name?: StringFilter<"Factory"> | string
    createdAt?: DateTimeFilter<"Factory"> | Date | string
    updatedAt?: DateTimeFilter<"Factory"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnit?: XOR<BusinessUnitScalarRelationFilter, BusinessUnitWhereInput>
  }

  export type FactoryOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    businessUnit?: BusinessUnitOrderByWithRelationInput
  }

  export type FactoryWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_businessUnitId_name?: FactoryTenantIdBusinessUnitIdNameCompoundUniqueInput
    AND?: FactoryWhereInput | FactoryWhereInput[]
    OR?: FactoryWhereInput[]
    NOT?: FactoryWhereInput | FactoryWhereInput[]
    tenantId?: UuidFilter<"Factory"> | string
    businessUnitId?: UuidFilter<"Factory"> | string
    name?: StringFilter<"Factory"> | string
    createdAt?: DateTimeFilter<"Factory"> | Date | string
    updatedAt?: DateTimeFilter<"Factory"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    businessUnit?: XOR<BusinessUnitScalarRelationFilter, BusinessUnitWhereInput>
  }, "id" | "tenantId_businessUnitId_name">

  export type FactoryOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: FactoryCountOrderByAggregateInput
    _max?: FactoryMaxOrderByAggregateInput
    _min?: FactoryMinOrderByAggregateInput
  }

  export type FactoryScalarWhereWithAggregatesInput = {
    AND?: FactoryScalarWhereWithAggregatesInput | FactoryScalarWhereWithAggregatesInput[]
    OR?: FactoryScalarWhereWithAggregatesInput[]
    NOT?: FactoryScalarWhereWithAggregatesInput | FactoryScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Factory"> | string
    tenantId?: UuidWithAggregatesFilter<"Factory"> | string
    businessUnitId?: UuidWithAggregatesFilter<"Factory"> | string
    name?: StringWithAggregatesFilter<"Factory"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Factory"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Factory"> | Date | string
  }

  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: UuidFilter<"User"> | string
    tenantId?: UuidFilter<"User"> | string
    email?: StringFilter<"User"> | string
    displayName?: StringFilter<"User"> | string
    status?: EnumUserStatusFilter<"User"> | $Enums.UserStatus
    idpSubject?: StringNullableFilter<"User"> | string | null
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    roleAssignments?: UserRoleAssignmentListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    status?: SortOrder
    idpSubject?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    roleAssignments?: UserRoleAssignmentOrderByRelationAggregateInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_email?: UserTenantIdEmailCompoundUniqueInput
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    tenantId?: UuidFilter<"User"> | string
    email?: StringFilter<"User"> | string
    displayName?: StringFilter<"User"> | string
    status?: EnumUserStatusFilter<"User"> | $Enums.UserStatus
    idpSubject?: StringNullableFilter<"User"> | string | null
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    roleAssignments?: UserRoleAssignmentListRelationFilter
  }, "id" | "tenantId_email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    status?: SortOrder
    idpSubject?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"User"> | string
    tenantId?: UuidWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    displayName?: StringWithAggregatesFilter<"User"> | string
    status?: EnumUserStatusWithAggregatesFilter<"User"> | $Enums.UserStatus
    idpSubject?: StringNullableWithAggregatesFilter<"User"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
  }

  export type RoleWhereInput = {
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    id?: UuidFilter<"Role"> | string
    tenantId?: UuidFilter<"Role"> | string
    name?: StringFilter<"Role"> | string
    description?: StringNullableFilter<"Role"> | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    permissions?: RolePermissionListRelationFilter
    assignments?: UserRoleAssignmentListRelationFilter
  }

  export type RoleOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    permissions?: RolePermissionOrderByRelationAggregateInput
    assignments?: UserRoleAssignmentOrderByRelationAggregateInput
  }

  export type RoleWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_name?: RoleTenantIdNameCompoundUniqueInput
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    tenantId?: UuidFilter<"Role"> | string
    name?: StringFilter<"Role"> | string
    description?: StringNullableFilter<"Role"> | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    permissions?: RolePermissionListRelationFilter
    assignments?: UserRoleAssignmentListRelationFilter
  }, "id" | "tenantId_name">

  export type RoleOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: RoleCountOrderByAggregateInput
    _max?: RoleMaxOrderByAggregateInput
    _min?: RoleMinOrderByAggregateInput
  }

  export type RoleScalarWhereWithAggregatesInput = {
    AND?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    OR?: RoleScalarWhereWithAggregatesInput[]
    NOT?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Role"> | string
    tenantId?: UuidWithAggregatesFilter<"Role"> | string
    name?: StringWithAggregatesFilter<"Role"> | string
    description?: StringNullableWithAggregatesFilter<"Role"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Role"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Role"> | Date | string
  }

  export type RolePermissionWhereInput = {
    AND?: RolePermissionWhereInput | RolePermissionWhereInput[]
    OR?: RolePermissionWhereInput[]
    NOT?: RolePermissionWhereInput | RolePermissionWhereInput[]
    id?: UuidFilter<"RolePermission"> | string
    tenantId?: UuidFilter<"RolePermission"> | string
    roleId?: UuidFilter<"RolePermission"> | string
    permissionKey?: StringFilter<"RolePermission"> | string
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }

  export type RolePermissionOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    roleId?: SortOrder
    permissionKey?: SortOrder
    role?: RoleOrderByWithRelationInput
  }

  export type RolePermissionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    roleId_permissionKey?: RolePermissionRoleIdPermissionKeyCompoundUniqueInput
    AND?: RolePermissionWhereInput | RolePermissionWhereInput[]
    OR?: RolePermissionWhereInput[]
    NOT?: RolePermissionWhereInput | RolePermissionWhereInput[]
    tenantId?: UuidFilter<"RolePermission"> | string
    roleId?: UuidFilter<"RolePermission"> | string
    permissionKey?: StringFilter<"RolePermission"> | string
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }, "id" | "roleId_permissionKey">

  export type RolePermissionOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    roleId?: SortOrder
    permissionKey?: SortOrder
    _count?: RolePermissionCountOrderByAggregateInput
    _max?: RolePermissionMaxOrderByAggregateInput
    _min?: RolePermissionMinOrderByAggregateInput
  }

  export type RolePermissionScalarWhereWithAggregatesInput = {
    AND?: RolePermissionScalarWhereWithAggregatesInput | RolePermissionScalarWhereWithAggregatesInput[]
    OR?: RolePermissionScalarWhereWithAggregatesInput[]
    NOT?: RolePermissionScalarWhereWithAggregatesInput | RolePermissionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"RolePermission"> | string
    tenantId?: UuidWithAggregatesFilter<"RolePermission"> | string
    roleId?: UuidWithAggregatesFilter<"RolePermission"> | string
    permissionKey?: StringWithAggregatesFilter<"RolePermission"> | string
  }

  export type UserRoleAssignmentWhereInput = {
    AND?: UserRoleAssignmentWhereInput | UserRoleAssignmentWhereInput[]
    OR?: UserRoleAssignmentWhereInput[]
    NOT?: UserRoleAssignmentWhereInput | UserRoleAssignmentWhereInput[]
    id?: UuidFilter<"UserRoleAssignment"> | string
    tenantId?: UuidFilter<"UserRoleAssignment"> | string
    userId?: UuidFilter<"UserRoleAssignment"> | string
    roleId?: UuidFilter<"UserRoleAssignment"> | string
    scopeType?: EnumScopeTypeFilter<"UserRoleAssignment"> | $Enums.ScopeType
    scopeId?: UuidFilter<"UserRoleAssignment"> | string
    createdAt?: DateTimeFilter<"UserRoleAssignment"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }

  export type UserRoleAssignmentOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    userId?: SortOrder
    roleId?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    createdAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    user?: UserOrderByWithRelationInput
    role?: RoleOrderByWithRelationInput
  }

  export type UserRoleAssignmentWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_userId_roleId_scopeType_scopeId?: UserRoleAssignmentTenantIdUserIdRoleIdScopeTypeScopeIdCompoundUniqueInput
    AND?: UserRoleAssignmentWhereInput | UserRoleAssignmentWhereInput[]
    OR?: UserRoleAssignmentWhereInput[]
    NOT?: UserRoleAssignmentWhereInput | UserRoleAssignmentWhereInput[]
    tenantId?: UuidFilter<"UserRoleAssignment"> | string
    userId?: UuidFilter<"UserRoleAssignment"> | string
    roleId?: UuidFilter<"UserRoleAssignment"> | string
    scopeType?: EnumScopeTypeFilter<"UserRoleAssignment"> | $Enums.ScopeType
    scopeId?: UuidFilter<"UserRoleAssignment"> | string
    createdAt?: DateTimeFilter<"UserRoleAssignment"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }, "id" | "tenantId_userId_roleId_scopeType_scopeId">

  export type UserRoleAssignmentOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    userId?: SortOrder
    roleId?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    createdAt?: SortOrder
    _count?: UserRoleAssignmentCountOrderByAggregateInput
    _max?: UserRoleAssignmentMaxOrderByAggregateInput
    _min?: UserRoleAssignmentMinOrderByAggregateInput
  }

  export type UserRoleAssignmentScalarWhereWithAggregatesInput = {
    AND?: UserRoleAssignmentScalarWhereWithAggregatesInput | UserRoleAssignmentScalarWhereWithAggregatesInput[]
    OR?: UserRoleAssignmentScalarWhereWithAggregatesInput[]
    NOT?: UserRoleAssignmentScalarWhereWithAggregatesInput | UserRoleAssignmentScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"UserRoleAssignment"> | string
    tenantId?: UuidWithAggregatesFilter<"UserRoleAssignment"> | string
    userId?: UuidWithAggregatesFilter<"UserRoleAssignment"> | string
    roleId?: UuidWithAggregatesFilter<"UserRoleAssignment"> | string
    scopeType?: EnumScopeTypeWithAggregatesFilter<"UserRoleAssignment"> | $Enums.ScopeType
    scopeId?: UuidWithAggregatesFilter<"UserRoleAssignment"> | string
    createdAt?: DateTimeWithAggregatesFilter<"UserRoleAssignment"> | Date | string
  }

  export type AuditEventWhereInput = {
    AND?: AuditEventWhereInput | AuditEventWhereInput[]
    OR?: AuditEventWhereInput[]
    NOT?: AuditEventWhereInput | AuditEventWhereInput[]
    id?: UuidFilter<"AuditEvent"> | string
    tenantId?: UuidFilter<"AuditEvent"> | string
    actorType?: EnumActorTypeFilter<"AuditEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    objectType?: StringFilter<"AuditEvent"> | string
    objectId?: StringFilter<"AuditEvent"> | string
    occurredAt?: DateTimeFilter<"AuditEvent"> | Date | string
    correlationId?: StringFilter<"AuditEvent"> | string
    source?: StringFilter<"AuditEvent"> | string
    previousValues?: JsonNullableFilter<"AuditEvent">
    newValues?: JsonNullableFilter<"AuditEvent">
    reason?: StringNullableFilter<"AuditEvent"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }

  export type AuditEventOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrderInput | SortOrder
    action?: SortOrder
    objectType?: SortOrder
    objectId?: SortOrder
    occurredAt?: SortOrder
    correlationId?: SortOrder
    source?: SortOrder
    previousValues?: SortOrderInput | SortOrder
    newValues?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
    tenant?: TenantOrderByWithRelationInput
  }

  export type AuditEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: AuditEventWhereInput | AuditEventWhereInput[]
    OR?: AuditEventWhereInput[]
    NOT?: AuditEventWhereInput | AuditEventWhereInput[]
    tenantId?: UuidFilter<"AuditEvent"> | string
    actorType?: EnumActorTypeFilter<"AuditEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    objectType?: StringFilter<"AuditEvent"> | string
    objectId?: StringFilter<"AuditEvent"> | string
    occurredAt?: DateTimeFilter<"AuditEvent"> | Date | string
    correlationId?: StringFilter<"AuditEvent"> | string
    source?: StringFilter<"AuditEvent"> | string
    previousValues?: JsonNullableFilter<"AuditEvent">
    newValues?: JsonNullableFilter<"AuditEvent">
    reason?: StringNullableFilter<"AuditEvent"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }, "id">

  export type AuditEventOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrderInput | SortOrder
    action?: SortOrder
    objectType?: SortOrder
    objectId?: SortOrder
    occurredAt?: SortOrder
    correlationId?: SortOrder
    source?: SortOrder
    previousValues?: SortOrderInput | SortOrder
    newValues?: SortOrderInput | SortOrder
    reason?: SortOrderInput | SortOrder
    _count?: AuditEventCountOrderByAggregateInput
    _max?: AuditEventMaxOrderByAggregateInput
    _min?: AuditEventMinOrderByAggregateInput
  }

  export type AuditEventScalarWhereWithAggregatesInput = {
    AND?: AuditEventScalarWhereWithAggregatesInput | AuditEventScalarWhereWithAggregatesInput[]
    OR?: AuditEventScalarWhereWithAggregatesInput[]
    NOT?: AuditEventScalarWhereWithAggregatesInput | AuditEventScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"AuditEvent"> | string
    tenantId?: UuidWithAggregatesFilter<"AuditEvent"> | string
    actorType?: EnumActorTypeWithAggregatesFilter<"AuditEvent"> | $Enums.ActorType
    actorId?: StringNullableWithAggregatesFilter<"AuditEvent"> | string | null
    action?: StringWithAggregatesFilter<"AuditEvent"> | string
    objectType?: StringWithAggregatesFilter<"AuditEvent"> | string
    objectId?: StringWithAggregatesFilter<"AuditEvent"> | string
    occurredAt?: DateTimeWithAggregatesFilter<"AuditEvent"> | Date | string
    correlationId?: StringWithAggregatesFilter<"AuditEvent"> | string
    source?: StringWithAggregatesFilter<"AuditEvent"> | string
    previousValues?: JsonNullableWithAggregatesFilter<"AuditEvent">
    newValues?: JsonNullableWithAggregatesFilter<"AuditEvent">
    reason?: StringNullableWithAggregatesFilter<"AuditEvent"> | string | null
  }

  export type OutboxEventWhereInput = {
    AND?: OutboxEventWhereInput | OutboxEventWhereInput[]
    OR?: OutboxEventWhereInput[]
    NOT?: OutboxEventWhereInput | OutboxEventWhereInput[]
    id?: UuidFilter<"OutboxEvent"> | string
    tenantId?: UuidFilter<"OutboxEvent"> | string
    eventType?: StringFilter<"OutboxEvent"> | string
    eventVersion?: IntFilter<"OutboxEvent"> | number
    aggregateType?: StringFilter<"OutboxEvent"> | string
    aggregateId?: StringFilter<"OutboxEvent"> | string
    occurredAt?: DateTimeFilter<"OutboxEvent"> | Date | string
    actorType?: EnumActorTypeFilter<"OutboxEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"OutboxEvent"> | string | null
    correlationId?: StringFilter<"OutboxEvent"> | string
    causationId?: StringNullableFilter<"OutboxEvent"> | string | null
    payload?: JsonFilter<"OutboxEvent">
    status?: EnumOutboxStatusFilter<"OutboxEvent"> | $Enums.OutboxStatus
    attempts?: IntFilter<"OutboxEvent"> | number
    dispatchedAt?: DateTimeNullableFilter<"OutboxEvent"> | Date | string | null
    lastError?: StringNullableFilter<"OutboxEvent"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }

  export type OutboxEventOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    eventType?: SortOrder
    eventVersion?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    occurredAt?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrderInput | SortOrder
    correlationId?: SortOrder
    causationId?: SortOrderInput | SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    dispatchedAt?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    tenant?: TenantOrderByWithRelationInput
  }

  export type OutboxEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: OutboxEventWhereInput | OutboxEventWhereInput[]
    OR?: OutboxEventWhereInput[]
    NOT?: OutboxEventWhereInput | OutboxEventWhereInput[]
    tenantId?: UuidFilter<"OutboxEvent"> | string
    eventType?: StringFilter<"OutboxEvent"> | string
    eventVersion?: IntFilter<"OutboxEvent"> | number
    aggregateType?: StringFilter<"OutboxEvent"> | string
    aggregateId?: StringFilter<"OutboxEvent"> | string
    occurredAt?: DateTimeFilter<"OutboxEvent"> | Date | string
    actorType?: EnumActorTypeFilter<"OutboxEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"OutboxEvent"> | string | null
    correlationId?: StringFilter<"OutboxEvent"> | string
    causationId?: StringNullableFilter<"OutboxEvent"> | string | null
    payload?: JsonFilter<"OutboxEvent">
    status?: EnumOutboxStatusFilter<"OutboxEvent"> | $Enums.OutboxStatus
    attempts?: IntFilter<"OutboxEvent"> | number
    dispatchedAt?: DateTimeNullableFilter<"OutboxEvent"> | Date | string | null
    lastError?: StringNullableFilter<"OutboxEvent"> | string | null
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }, "id">

  export type OutboxEventOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    eventType?: SortOrder
    eventVersion?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    occurredAt?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrderInput | SortOrder
    correlationId?: SortOrder
    causationId?: SortOrderInput | SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    dispatchedAt?: SortOrderInput | SortOrder
    lastError?: SortOrderInput | SortOrder
    _count?: OutboxEventCountOrderByAggregateInput
    _avg?: OutboxEventAvgOrderByAggregateInput
    _max?: OutboxEventMaxOrderByAggregateInput
    _min?: OutboxEventMinOrderByAggregateInput
    _sum?: OutboxEventSumOrderByAggregateInput
  }

  export type OutboxEventScalarWhereWithAggregatesInput = {
    AND?: OutboxEventScalarWhereWithAggregatesInput | OutboxEventScalarWhereWithAggregatesInput[]
    OR?: OutboxEventScalarWhereWithAggregatesInput[]
    NOT?: OutboxEventScalarWhereWithAggregatesInput | OutboxEventScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"OutboxEvent"> | string
    tenantId?: UuidWithAggregatesFilter<"OutboxEvent"> | string
    eventType?: StringWithAggregatesFilter<"OutboxEvent"> | string
    eventVersion?: IntWithAggregatesFilter<"OutboxEvent"> | number
    aggregateType?: StringWithAggregatesFilter<"OutboxEvent"> | string
    aggregateId?: StringWithAggregatesFilter<"OutboxEvent"> | string
    occurredAt?: DateTimeWithAggregatesFilter<"OutboxEvent"> | Date | string
    actorType?: EnumActorTypeWithAggregatesFilter<"OutboxEvent"> | $Enums.ActorType
    actorId?: StringNullableWithAggregatesFilter<"OutboxEvent"> | string | null
    correlationId?: StringWithAggregatesFilter<"OutboxEvent"> | string
    causationId?: StringNullableWithAggregatesFilter<"OutboxEvent"> | string | null
    payload?: JsonWithAggregatesFilter<"OutboxEvent">
    status?: EnumOutboxStatusWithAggregatesFilter<"OutboxEvent"> | $Enums.OutboxStatus
    attempts?: IntWithAggregatesFilter<"OutboxEvent"> | number
    dispatchedAt?: DateTimeNullableWithAggregatesFilter<"OutboxEvent"> | Date | string | null
    lastError?: StringNullableWithAggregatesFilter<"OutboxEvent"> | string | null
  }

  export type TenantCreateInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantCreateManyInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantConfigurationVersionCreateInput = {
    id?: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
    tenant: TenantCreateNestedOneWithoutConfigurationVersionsInput
  }

  export type TenantConfigurationVersionUncheckedCreateInput = {
    id?: string
    tenantId: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
  }

  export type TenantConfigurationVersionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
    tenant?: TenantUpdateOneRequiredWithoutConfigurationVersionsNestedInput
  }

  export type TenantConfigurationVersionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TenantConfigurationVersionCreateManyInput = {
    id?: string
    tenantId: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
  }

  export type TenantConfigurationVersionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TenantConfigurationVersionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type LegalEntityCreateInput = {
    id?: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutLegalEntitiesInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutLegalEntityInput
  }

  export type LegalEntityUncheckedCreateInput = {
    id?: string
    tenantId: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutLegalEntityInput
  }

  export type LegalEntityUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutLegalEntitiesNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutLegalEntityNestedInput
  }

  export type LegalEntityUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutLegalEntityNestedInput
  }

  export type LegalEntityCreateManyInput = {
    id?: string
    tenantId: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LegalEntityUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LegalEntityUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BusinessUnitCreateInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitCreateManyInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BusinessUnitUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BusinessUnitUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchCreateInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBranchesInput
    businessUnit: BusinessUnitCreateNestedOneWithoutBranchesInput
  }

  export type BranchUncheckedCreateInput = {
    id?: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBranchesNestedInput
    businessUnit?: BusinessUnitUpdateOneRequiredWithoutBranchesNestedInput
  }

  export type BranchUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchCreateManyInput = {
    id?: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryCreateInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutFactoriesInput
    businessUnit: BusinessUnitCreateNestedOneWithoutFactoriesInput
  }

  export type FactoryUncheckedCreateInput = {
    id?: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutFactoriesNestedInput
    businessUnit?: BusinessUnitUpdateOneRequiredWithoutFactoriesNestedInput
  }

  export type FactoryUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryCreateManyInput = {
    id?: string
    tenantId: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserCreateInput = {
    id?: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutUsersInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateInput = {
    id?: string
    tenantId: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutUsersNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateManyInput = {
    id?: string
    tenantId: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRolesInput
    permissions?: RolePermissionCreateNestedManyWithoutRoleInput
    assignments?: UserRoleAssignmentCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateInput = {
    id?: string
    tenantId: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    permissions?: RolePermissionUncheckedCreateNestedManyWithoutRoleInput
    assignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRolesNestedInput
    permissions?: RolePermissionUpdateManyWithoutRoleNestedInput
    assignments?: UserRoleAssignmentUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    permissions?: RolePermissionUncheckedUpdateManyWithoutRoleNestedInput
    assignments?: UserRoleAssignmentUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type RoleCreateManyInput = {
    id?: string
    tenantId: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RolePermissionCreateInput = {
    id?: string
    tenantId: string
    permissionKey: string
    role: RoleCreateNestedOneWithoutPermissionsInput
  }

  export type RolePermissionUncheckedCreateInput = {
    id?: string
    tenantId: string
    roleId: string
    permissionKey: string
  }

  export type RolePermissionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
    role?: RoleUpdateOneRequiredWithoutPermissionsNestedInput
  }

  export type RolePermissionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type RolePermissionCreateManyInput = {
    id?: string
    tenantId: string
    roleId: string
    permissionKey: string
  }

  export type RolePermissionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type RolePermissionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type UserRoleAssignmentCreateInput = {
    id?: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRoleAssignmentsInput
    user: UserCreateNestedOneWithoutRoleAssignmentsInput
    role: RoleCreateNestedOneWithoutAssignmentsInput
  }

  export type UserRoleAssignmentUncheckedCreateInput = {
    id?: string
    tenantId: string
    userId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRoleAssignmentsNestedInput
    user?: UserUpdateOneRequiredWithoutRoleAssignmentsNestedInput
    role?: RoleUpdateOneRequiredWithoutAssignmentsNestedInput
  }

  export type UserRoleAssignmentUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentCreateManyInput = {
    id?: string
    tenantId: string
    userId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventCreateInput = {
    id?: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
    tenant: TenantCreateNestedOneWithoutAuditEventsInput
  }

  export type AuditEventUncheckedCreateInput = {
    id?: string
    tenantId: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
  }

  export type AuditEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
    tenant?: TenantUpdateOneRequiredWithoutAuditEventsNestedInput
  }

  export type AuditEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AuditEventCreateManyInput = {
    id?: string
    tenantId: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
  }

  export type AuditEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AuditEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventCreateInput = {
    id?: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
    tenant: TenantCreateNestedOneWithoutOutboxEventsInput
  }

  export type OutboxEventUncheckedCreateInput = {
    id?: string
    tenantId: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
  }

  export type OutboxEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    tenant?: TenantUpdateOneRequiredWithoutOutboxEventsNestedInput
  }

  export type OutboxEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventCreateManyInput = {
    id?: string
    tenantId: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
  }

  export type OutboxEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type UuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type EnumTenantStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TenantStatus | EnumTenantStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTenantStatusFilter<$PrismaModel> | $Enums.TenantStatus
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type TenantConfigurationVersionListRelationFilter = {
    every?: TenantConfigurationVersionWhereInput
    some?: TenantConfigurationVersionWhereInput
    none?: TenantConfigurationVersionWhereInput
  }

  export type LegalEntityListRelationFilter = {
    every?: LegalEntityWhereInput
    some?: LegalEntityWhereInput
    none?: LegalEntityWhereInput
  }

  export type BusinessUnitListRelationFilter = {
    every?: BusinessUnitWhereInput
    some?: BusinessUnitWhereInput
    none?: BusinessUnitWhereInput
  }

  export type BranchListRelationFilter = {
    every?: BranchWhereInput
    some?: BranchWhereInput
    none?: BranchWhereInput
  }

  export type FactoryListRelationFilter = {
    every?: FactoryWhereInput
    some?: FactoryWhereInput
    none?: FactoryWhereInput
  }

  export type UserListRelationFilter = {
    every?: UserWhereInput
    some?: UserWhereInput
    none?: UserWhereInput
  }

  export type RoleListRelationFilter = {
    every?: RoleWhereInput
    some?: RoleWhereInput
    none?: RoleWhereInput
  }

  export type UserRoleAssignmentListRelationFilter = {
    every?: UserRoleAssignmentWhereInput
    some?: UserRoleAssignmentWhereInput
    none?: UserRoleAssignmentWhereInput
  }

  export type AuditEventListRelationFilter = {
    every?: AuditEventWhereInput
    some?: AuditEventWhereInput
    none?: AuditEventWhereInput
  }

  export type OutboxEventListRelationFilter = {
    every?: OutboxEventWhereInput
    some?: OutboxEventWhereInput
    none?: OutboxEventWhereInput
  }

  export type TenantConfigurationVersionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type LegalEntityOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type BusinessUnitOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type BranchOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type FactoryOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type RoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserRoleAssignmentOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AuditEventOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type OutboxEventOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TenantCountOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    status?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantAvgOrderByAggregateInput = {
    version?: SortOrder
  }

  export type TenantMaxOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    status?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantMinOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    name?: SortOrder
    status?: SortOrder
    version?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantSumOrderByAggregateInput = {
    version?: SortOrder
  }

  export type UuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type EnumTenantStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TenantStatus | EnumTenantStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTenantStatusWithAggregatesFilter<$PrismaModel> | $Enums.TenantStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTenantStatusFilter<$PrismaModel>
    _max?: NestedEnumTenantStatusFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type UuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }

  export type TenantScalarRelationFilter = {
    is?: TenantWhereInput
    isNot?: TenantWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type TenantConfigurationVersionTenantIdVersionCompoundUniqueInput = {
    tenantId: string
    version: number
  }

  export type TenantConfigurationVersionCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    version?: SortOrder
    config?: SortOrder
    publishedAt?: SortOrder
    publishedBy?: SortOrder
  }

  export type TenantConfigurationVersionAvgOrderByAggregateInput = {
    version?: SortOrder
  }

  export type TenantConfigurationVersionMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    version?: SortOrder
    publishedAt?: SortOrder
    publishedBy?: SortOrder
  }

  export type TenantConfigurationVersionMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    version?: SortOrder
    publishedAt?: SortOrder
    publishedBy?: SortOrder
  }

  export type TenantConfigurationVersionSumOrderByAggregateInput = {
    version?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type UuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type LegalEntityTenantIdNameCompoundUniqueInput = {
    tenantId: string
    name: string
  }

  export type LegalEntityCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    code?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LegalEntityMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    code?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LegalEntityMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    code?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type LegalEntityScalarRelationFilter = {
    is?: LegalEntityWhereInput
    isNot?: LegalEntityWhereInput
  }

  export type BusinessUnitNullableScalarRelationFilter = {
    is?: BusinessUnitWhereInput | null
    isNot?: BusinessUnitWhereInput | null
  }

  export type BusinessUnitTenantIdLegalEntityIdNameCompoundUniqueInput = {
    tenantId: string
    legalEntityId: string
    name: string
  }

  export type BusinessUnitCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    legalEntityId?: SortOrder
    parentId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BusinessUnitMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    legalEntityId?: SortOrder
    parentId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BusinessUnitMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    legalEntityId?: SortOrder
    parentId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BusinessUnitScalarRelationFilter = {
    is?: BusinessUnitWhereInput
    isNot?: BusinessUnitWhereInput
  }

  export type BranchTenantIdBusinessUnitIdNameCompoundUniqueInput = {
    tenantId: string
    businessUnitId: string
    name: string
  }

  export type BranchCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BranchMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BranchMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FactoryTenantIdBusinessUnitIdNameCompoundUniqueInput = {
    tenantId: string
    businessUnitId: string
    name: string
  }

  export type FactoryCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FactoryMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FactoryMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    businessUnitId?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumUserStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.UserStatus | EnumUserStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUserStatusFilter<$PrismaModel> | $Enums.UserStatus
  }

  export type UserTenantIdEmailCompoundUniqueInput = {
    tenantId: string
    email: string
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    status?: SortOrder
    idpSubject?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    status?: SortOrder
    idpSubject?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    email?: SortOrder
    displayName?: SortOrder
    status?: SortOrder
    idpSubject?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumUserStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.UserStatus | EnumUserStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUserStatusWithAggregatesFilter<$PrismaModel> | $Enums.UserStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumUserStatusFilter<$PrismaModel>
    _max?: NestedEnumUserStatusFilter<$PrismaModel>
  }

  export type RolePermissionListRelationFilter = {
    every?: RolePermissionWhereInput
    some?: RolePermissionWhereInput
    none?: RolePermissionWhereInput
  }

  export type RolePermissionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type RoleTenantIdNameCompoundUniqueInput = {
    tenantId: string
    name: string
  }

  export type RoleCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RoleMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RoleMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    description?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RoleScalarRelationFilter = {
    is?: RoleWhereInput
    isNot?: RoleWhereInput
  }

  export type RolePermissionRoleIdPermissionKeyCompoundUniqueInput = {
    roleId: string
    permissionKey: string
  }

  export type RolePermissionCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    roleId?: SortOrder
    permissionKey?: SortOrder
  }

  export type RolePermissionMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    roleId?: SortOrder
    permissionKey?: SortOrder
  }

  export type RolePermissionMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    roleId?: SortOrder
    permissionKey?: SortOrder
  }

  export type EnumScopeTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.ScopeType | EnumScopeTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumScopeTypeFilter<$PrismaModel> | $Enums.ScopeType
  }

  export type UserScalarRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type UserRoleAssignmentTenantIdUserIdRoleIdScopeTypeScopeIdCompoundUniqueInput = {
    tenantId: string
    userId: string
    roleId: string
    scopeType: $Enums.ScopeType
    scopeId: string
  }

  export type UserRoleAssignmentCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    userId?: SortOrder
    roleId?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    createdAt?: SortOrder
  }

  export type UserRoleAssignmentMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    userId?: SortOrder
    roleId?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    createdAt?: SortOrder
  }

  export type UserRoleAssignmentMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    userId?: SortOrder
    roleId?: SortOrder
    scopeType?: SortOrder
    scopeId?: SortOrder
    createdAt?: SortOrder
  }

  export type EnumScopeTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ScopeType | EnumScopeTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumScopeTypeWithAggregatesFilter<$PrismaModel> | $Enums.ScopeType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumScopeTypeFilter<$PrismaModel>
    _max?: NestedEnumScopeTypeFilter<$PrismaModel>
  }

  export type EnumActorTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.ActorType | EnumActorTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumActorTypeFilter<$PrismaModel> | $Enums.ActorType
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type AuditEventCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    action?: SortOrder
    objectType?: SortOrder
    objectId?: SortOrder
    occurredAt?: SortOrder
    correlationId?: SortOrder
    source?: SortOrder
    previousValues?: SortOrder
    newValues?: SortOrder
    reason?: SortOrder
  }

  export type AuditEventMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    action?: SortOrder
    objectType?: SortOrder
    objectId?: SortOrder
    occurredAt?: SortOrder
    correlationId?: SortOrder
    source?: SortOrder
    reason?: SortOrder
  }

  export type AuditEventMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    action?: SortOrder
    objectType?: SortOrder
    objectId?: SortOrder
    occurredAt?: SortOrder
    correlationId?: SortOrder
    source?: SortOrder
    reason?: SortOrder
  }

  export type EnumActorTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ActorType | EnumActorTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumActorTypeWithAggregatesFilter<$PrismaModel> | $Enums.ActorType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumActorTypeFilter<$PrismaModel>
    _max?: NestedEnumActorTypeFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type EnumOutboxStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.OutboxStatus | EnumOutboxStatusFieldRefInput<$PrismaModel>
    in?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumOutboxStatusFilter<$PrismaModel> | $Enums.OutboxStatus
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type OutboxEventCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    eventType?: SortOrder
    eventVersion?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    occurredAt?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    payload?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    dispatchedAt?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventAvgOrderByAggregateInput = {
    eventVersion?: SortOrder
    attempts?: SortOrder
  }

  export type OutboxEventMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    eventType?: SortOrder
    eventVersion?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    occurredAt?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    dispatchedAt?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    eventType?: SortOrder
    eventVersion?: SortOrder
    aggregateType?: SortOrder
    aggregateId?: SortOrder
    occurredAt?: SortOrder
    actorType?: SortOrder
    actorId?: SortOrder
    correlationId?: SortOrder
    causationId?: SortOrder
    status?: SortOrder
    attempts?: SortOrder
    dispatchedAt?: SortOrder
    lastError?: SortOrder
  }

  export type OutboxEventSumOrderByAggregateInput = {
    eventVersion?: SortOrder
    attempts?: SortOrder
  }

  export type EnumOutboxStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.OutboxStatus | EnumOutboxStatusFieldRefInput<$PrismaModel>
    in?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumOutboxStatusWithAggregatesFilter<$PrismaModel> | $Enums.OutboxStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumOutboxStatusFilter<$PrismaModel>
    _max?: NestedEnumOutboxStatusFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type TenantConfigurationVersionCreateNestedManyWithoutTenantInput = {
    create?: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput> | TenantConfigurationVersionCreateWithoutTenantInput[] | TenantConfigurationVersionUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantConfigurationVersionCreateOrConnectWithoutTenantInput | TenantConfigurationVersionCreateOrConnectWithoutTenantInput[]
    createMany?: TenantConfigurationVersionCreateManyTenantInputEnvelope
    connect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
  }

  export type LegalEntityCreateNestedManyWithoutTenantInput = {
    create?: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput> | LegalEntityCreateWithoutTenantInput[] | LegalEntityUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: LegalEntityCreateOrConnectWithoutTenantInput | LegalEntityCreateOrConnectWithoutTenantInput[]
    createMany?: LegalEntityCreateManyTenantInputEnvelope
    connect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
  }

  export type BusinessUnitCreateNestedManyWithoutTenantInput = {
    create?: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput> | BusinessUnitCreateWithoutTenantInput[] | BusinessUnitUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutTenantInput | BusinessUnitCreateOrConnectWithoutTenantInput[]
    createMany?: BusinessUnitCreateManyTenantInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type BranchCreateNestedManyWithoutTenantInput = {
    create?: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput> | BranchCreateWithoutTenantInput[] | BranchUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutTenantInput | BranchCreateOrConnectWithoutTenantInput[]
    createMany?: BranchCreateManyTenantInputEnvelope
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
  }

  export type FactoryCreateNestedManyWithoutTenantInput = {
    create?: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput> | FactoryCreateWithoutTenantInput[] | FactoryUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutTenantInput | FactoryCreateOrConnectWithoutTenantInput[]
    createMany?: FactoryCreateManyTenantInputEnvelope
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
  }

  export type UserCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type RoleCreateNestedManyWithoutTenantInput = {
    create?: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput> | RoleCreateWithoutTenantInput[] | RoleUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutTenantInput | RoleCreateOrConnectWithoutTenantInput[]
    createMany?: RoleCreateManyTenantInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type UserRoleAssignmentCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput> | UserRoleAssignmentCreateWithoutTenantInput[] | UserRoleAssignmentUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutTenantInput | UserRoleAssignmentCreateOrConnectWithoutTenantInput[]
    createMany?: UserRoleAssignmentCreateManyTenantInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type AuditEventCreateNestedManyWithoutTenantInput = {
    create?: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput> | AuditEventCreateWithoutTenantInput[] | AuditEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutTenantInput | AuditEventCreateOrConnectWithoutTenantInput[]
    createMany?: AuditEventCreateManyTenantInputEnvelope
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
  }

  export type OutboxEventCreateNestedManyWithoutTenantInput = {
    create?: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput> | OutboxEventCreateWithoutTenantInput[] | OutboxEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: OutboxEventCreateOrConnectWithoutTenantInput | OutboxEventCreateOrConnectWithoutTenantInput[]
    createMany?: OutboxEventCreateManyTenantInputEnvelope
    connect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
  }

  export type TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput> | TenantConfigurationVersionCreateWithoutTenantInput[] | TenantConfigurationVersionUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantConfigurationVersionCreateOrConnectWithoutTenantInput | TenantConfigurationVersionCreateOrConnectWithoutTenantInput[]
    createMany?: TenantConfigurationVersionCreateManyTenantInputEnvelope
    connect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
  }

  export type LegalEntityUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput> | LegalEntityCreateWithoutTenantInput[] | LegalEntityUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: LegalEntityCreateOrConnectWithoutTenantInput | LegalEntityCreateOrConnectWithoutTenantInput[]
    createMany?: LegalEntityCreateManyTenantInputEnvelope
    connect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
  }

  export type BusinessUnitUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput> | BusinessUnitCreateWithoutTenantInput[] | BusinessUnitUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutTenantInput | BusinessUnitCreateOrConnectWithoutTenantInput[]
    createMany?: BusinessUnitCreateManyTenantInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type BranchUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput> | BranchCreateWithoutTenantInput[] | BranchUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutTenantInput | BranchCreateOrConnectWithoutTenantInput[]
    createMany?: BranchCreateManyTenantInputEnvelope
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
  }

  export type FactoryUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput> | FactoryCreateWithoutTenantInput[] | FactoryUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutTenantInput | FactoryCreateOrConnectWithoutTenantInput[]
    createMany?: FactoryCreateManyTenantInputEnvelope
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
  }

  export type UserUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type RoleUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput> | RoleCreateWithoutTenantInput[] | RoleUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutTenantInput | RoleCreateOrConnectWithoutTenantInput[]
    createMany?: RoleCreateManyTenantInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput> | UserRoleAssignmentCreateWithoutTenantInput[] | UserRoleAssignmentUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutTenantInput | UserRoleAssignmentCreateOrConnectWithoutTenantInput[]
    createMany?: UserRoleAssignmentCreateManyTenantInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type AuditEventUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput> | AuditEventCreateWithoutTenantInput[] | AuditEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutTenantInput | AuditEventCreateOrConnectWithoutTenantInput[]
    createMany?: AuditEventCreateManyTenantInputEnvelope
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
  }

  export type OutboxEventUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput> | OutboxEventCreateWithoutTenantInput[] | OutboxEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: OutboxEventCreateOrConnectWithoutTenantInput | OutboxEventCreateOrConnectWithoutTenantInput[]
    createMany?: OutboxEventCreateManyTenantInputEnvelope
    connect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type EnumTenantStatusFieldUpdateOperationsInput = {
    set?: $Enums.TenantStatus
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type TenantConfigurationVersionUpdateManyWithoutTenantNestedInput = {
    create?: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput> | TenantConfigurationVersionCreateWithoutTenantInput[] | TenantConfigurationVersionUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantConfigurationVersionCreateOrConnectWithoutTenantInput | TenantConfigurationVersionCreateOrConnectWithoutTenantInput[]
    upsert?: TenantConfigurationVersionUpsertWithWhereUniqueWithoutTenantInput | TenantConfigurationVersionUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: TenantConfigurationVersionCreateManyTenantInputEnvelope
    set?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    disconnect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    delete?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    connect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    update?: TenantConfigurationVersionUpdateWithWhereUniqueWithoutTenantInput | TenantConfigurationVersionUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: TenantConfigurationVersionUpdateManyWithWhereWithoutTenantInput | TenantConfigurationVersionUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: TenantConfigurationVersionScalarWhereInput | TenantConfigurationVersionScalarWhereInput[]
  }

  export type LegalEntityUpdateManyWithoutTenantNestedInput = {
    create?: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput> | LegalEntityCreateWithoutTenantInput[] | LegalEntityUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: LegalEntityCreateOrConnectWithoutTenantInput | LegalEntityCreateOrConnectWithoutTenantInput[]
    upsert?: LegalEntityUpsertWithWhereUniqueWithoutTenantInput | LegalEntityUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: LegalEntityCreateManyTenantInputEnvelope
    set?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    disconnect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    delete?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    connect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    update?: LegalEntityUpdateWithWhereUniqueWithoutTenantInput | LegalEntityUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: LegalEntityUpdateManyWithWhereWithoutTenantInput | LegalEntityUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: LegalEntityScalarWhereInput | LegalEntityScalarWhereInput[]
  }

  export type BusinessUnitUpdateManyWithoutTenantNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput> | BusinessUnitCreateWithoutTenantInput[] | BusinessUnitUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutTenantInput | BusinessUnitCreateOrConnectWithoutTenantInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutTenantInput | BusinessUnitUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: BusinessUnitCreateManyTenantInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutTenantInput | BusinessUnitUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutTenantInput | BusinessUnitUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type BranchUpdateManyWithoutTenantNestedInput = {
    create?: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput> | BranchCreateWithoutTenantInput[] | BranchUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutTenantInput | BranchCreateOrConnectWithoutTenantInput[]
    upsert?: BranchUpsertWithWhereUniqueWithoutTenantInput | BranchUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: BranchCreateManyTenantInputEnvelope
    set?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    disconnect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    delete?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    update?: BranchUpdateWithWhereUniqueWithoutTenantInput | BranchUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: BranchUpdateManyWithWhereWithoutTenantInput | BranchUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: BranchScalarWhereInput | BranchScalarWhereInput[]
  }

  export type FactoryUpdateManyWithoutTenantNestedInput = {
    create?: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput> | FactoryCreateWithoutTenantInput[] | FactoryUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutTenantInput | FactoryCreateOrConnectWithoutTenantInput[]
    upsert?: FactoryUpsertWithWhereUniqueWithoutTenantInput | FactoryUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: FactoryCreateManyTenantInputEnvelope
    set?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    disconnect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    delete?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    update?: FactoryUpdateWithWhereUniqueWithoutTenantInput | FactoryUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: FactoryUpdateManyWithWhereWithoutTenantInput | FactoryUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
  }

  export type UserUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutTenantInput | UserUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutTenantInput | UserUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserUpdateManyWithWhereWithoutTenantInput | UserUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type RoleUpdateManyWithoutTenantNestedInput = {
    create?: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput> | RoleCreateWithoutTenantInput[] | RoleUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutTenantInput | RoleCreateOrConnectWithoutTenantInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutTenantInput | RoleUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: RoleCreateManyTenantInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutTenantInput | RoleUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutTenantInput | RoleUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type UserRoleAssignmentUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput> | UserRoleAssignmentCreateWithoutTenantInput[] | UserRoleAssignmentUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutTenantInput | UserRoleAssignmentCreateOrConnectWithoutTenantInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutTenantInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserRoleAssignmentCreateManyTenantInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutTenantInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutTenantInput | UserRoleAssignmentUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type AuditEventUpdateManyWithoutTenantNestedInput = {
    create?: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput> | AuditEventCreateWithoutTenantInput[] | AuditEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutTenantInput | AuditEventCreateOrConnectWithoutTenantInput[]
    upsert?: AuditEventUpsertWithWhereUniqueWithoutTenantInput | AuditEventUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: AuditEventCreateManyTenantInputEnvelope
    set?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    disconnect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    delete?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    update?: AuditEventUpdateWithWhereUniqueWithoutTenantInput | AuditEventUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: AuditEventUpdateManyWithWhereWithoutTenantInput | AuditEventUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
  }

  export type OutboxEventUpdateManyWithoutTenantNestedInput = {
    create?: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput> | OutboxEventCreateWithoutTenantInput[] | OutboxEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: OutboxEventCreateOrConnectWithoutTenantInput | OutboxEventCreateOrConnectWithoutTenantInput[]
    upsert?: OutboxEventUpsertWithWhereUniqueWithoutTenantInput | OutboxEventUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: OutboxEventCreateManyTenantInputEnvelope
    set?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    disconnect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    delete?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    connect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    update?: OutboxEventUpdateWithWhereUniqueWithoutTenantInput | OutboxEventUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: OutboxEventUpdateManyWithWhereWithoutTenantInput | OutboxEventUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: OutboxEventScalarWhereInput | OutboxEventScalarWhereInput[]
  }

  export type TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput> | TenantConfigurationVersionCreateWithoutTenantInput[] | TenantConfigurationVersionUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantConfigurationVersionCreateOrConnectWithoutTenantInput | TenantConfigurationVersionCreateOrConnectWithoutTenantInput[]
    upsert?: TenantConfigurationVersionUpsertWithWhereUniqueWithoutTenantInput | TenantConfigurationVersionUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: TenantConfigurationVersionCreateManyTenantInputEnvelope
    set?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    disconnect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    delete?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    connect?: TenantConfigurationVersionWhereUniqueInput | TenantConfigurationVersionWhereUniqueInput[]
    update?: TenantConfigurationVersionUpdateWithWhereUniqueWithoutTenantInput | TenantConfigurationVersionUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: TenantConfigurationVersionUpdateManyWithWhereWithoutTenantInput | TenantConfigurationVersionUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: TenantConfigurationVersionScalarWhereInput | TenantConfigurationVersionScalarWhereInput[]
  }

  export type LegalEntityUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput> | LegalEntityCreateWithoutTenantInput[] | LegalEntityUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: LegalEntityCreateOrConnectWithoutTenantInput | LegalEntityCreateOrConnectWithoutTenantInput[]
    upsert?: LegalEntityUpsertWithWhereUniqueWithoutTenantInput | LegalEntityUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: LegalEntityCreateManyTenantInputEnvelope
    set?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    disconnect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    delete?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    connect?: LegalEntityWhereUniqueInput | LegalEntityWhereUniqueInput[]
    update?: LegalEntityUpdateWithWhereUniqueWithoutTenantInput | LegalEntityUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: LegalEntityUpdateManyWithWhereWithoutTenantInput | LegalEntityUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: LegalEntityScalarWhereInput | LegalEntityScalarWhereInput[]
  }

  export type BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput> | BusinessUnitCreateWithoutTenantInput[] | BusinessUnitUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutTenantInput | BusinessUnitCreateOrConnectWithoutTenantInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutTenantInput | BusinessUnitUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: BusinessUnitCreateManyTenantInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutTenantInput | BusinessUnitUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutTenantInput | BusinessUnitUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type BranchUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput> | BranchCreateWithoutTenantInput[] | BranchUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutTenantInput | BranchCreateOrConnectWithoutTenantInput[]
    upsert?: BranchUpsertWithWhereUniqueWithoutTenantInput | BranchUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: BranchCreateManyTenantInputEnvelope
    set?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    disconnect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    delete?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    update?: BranchUpdateWithWhereUniqueWithoutTenantInput | BranchUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: BranchUpdateManyWithWhereWithoutTenantInput | BranchUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: BranchScalarWhereInput | BranchScalarWhereInput[]
  }

  export type FactoryUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput> | FactoryCreateWithoutTenantInput[] | FactoryUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutTenantInput | FactoryCreateOrConnectWithoutTenantInput[]
    upsert?: FactoryUpsertWithWhereUniqueWithoutTenantInput | FactoryUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: FactoryCreateManyTenantInputEnvelope
    set?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    disconnect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    delete?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    update?: FactoryUpdateWithWhereUniqueWithoutTenantInput | FactoryUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: FactoryUpdateManyWithWhereWithoutTenantInput | FactoryUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
  }

  export type UserUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutTenantInput | UserUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutTenantInput | UserUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserUpdateManyWithWhereWithoutTenantInput | UserUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type RoleUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput> | RoleCreateWithoutTenantInput[] | RoleUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutTenantInput | RoleCreateOrConnectWithoutTenantInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutTenantInput | RoleUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: RoleCreateManyTenantInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutTenantInput | RoleUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutTenantInput | RoleUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput> | UserRoleAssignmentCreateWithoutTenantInput[] | UserRoleAssignmentUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutTenantInput | UserRoleAssignmentCreateOrConnectWithoutTenantInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutTenantInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserRoleAssignmentCreateManyTenantInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutTenantInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutTenantInput | UserRoleAssignmentUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type AuditEventUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput> | AuditEventCreateWithoutTenantInput[] | AuditEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: AuditEventCreateOrConnectWithoutTenantInput | AuditEventCreateOrConnectWithoutTenantInput[]
    upsert?: AuditEventUpsertWithWhereUniqueWithoutTenantInput | AuditEventUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: AuditEventCreateManyTenantInputEnvelope
    set?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    disconnect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    delete?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    connect?: AuditEventWhereUniqueInput | AuditEventWhereUniqueInput[]
    update?: AuditEventUpdateWithWhereUniqueWithoutTenantInput | AuditEventUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: AuditEventUpdateManyWithWhereWithoutTenantInput | AuditEventUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
  }

  export type OutboxEventUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput> | OutboxEventCreateWithoutTenantInput[] | OutboxEventUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: OutboxEventCreateOrConnectWithoutTenantInput | OutboxEventCreateOrConnectWithoutTenantInput[]
    upsert?: OutboxEventUpsertWithWhereUniqueWithoutTenantInput | OutboxEventUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: OutboxEventCreateManyTenantInputEnvelope
    set?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    disconnect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    delete?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    connect?: OutboxEventWhereUniqueInput | OutboxEventWhereUniqueInput[]
    update?: OutboxEventUpdateWithWhereUniqueWithoutTenantInput | OutboxEventUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: OutboxEventUpdateManyWithWhereWithoutTenantInput | OutboxEventUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: OutboxEventScalarWhereInput | OutboxEventScalarWhereInput[]
  }

  export type TenantCreateNestedOneWithoutConfigurationVersionsInput = {
    create?: XOR<TenantCreateWithoutConfigurationVersionsInput, TenantUncheckedCreateWithoutConfigurationVersionsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutConfigurationVersionsInput
    connect?: TenantWhereUniqueInput
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type TenantUpdateOneRequiredWithoutConfigurationVersionsNestedInput = {
    create?: XOR<TenantCreateWithoutConfigurationVersionsInput, TenantUncheckedCreateWithoutConfigurationVersionsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutConfigurationVersionsInput
    upsert?: TenantUpsertWithoutConfigurationVersionsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutConfigurationVersionsInput, TenantUpdateWithoutConfigurationVersionsInput>, TenantUncheckedUpdateWithoutConfigurationVersionsInput>
  }

  export type TenantCreateNestedOneWithoutLegalEntitiesInput = {
    create?: XOR<TenantCreateWithoutLegalEntitiesInput, TenantUncheckedCreateWithoutLegalEntitiesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutLegalEntitiesInput
    connect?: TenantWhereUniqueInput
  }

  export type BusinessUnitCreateNestedManyWithoutLegalEntityInput = {
    create?: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput> | BusinessUnitCreateWithoutLegalEntityInput[] | BusinessUnitUncheckedCreateWithoutLegalEntityInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutLegalEntityInput | BusinessUnitCreateOrConnectWithoutLegalEntityInput[]
    createMany?: BusinessUnitCreateManyLegalEntityInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type BusinessUnitUncheckedCreateNestedManyWithoutLegalEntityInput = {
    create?: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput> | BusinessUnitCreateWithoutLegalEntityInput[] | BusinessUnitUncheckedCreateWithoutLegalEntityInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutLegalEntityInput | BusinessUnitCreateOrConnectWithoutLegalEntityInput[]
    createMany?: BusinessUnitCreateManyLegalEntityInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type TenantUpdateOneRequiredWithoutLegalEntitiesNestedInput = {
    create?: XOR<TenantCreateWithoutLegalEntitiesInput, TenantUncheckedCreateWithoutLegalEntitiesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutLegalEntitiesInput
    upsert?: TenantUpsertWithoutLegalEntitiesInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutLegalEntitiesInput, TenantUpdateWithoutLegalEntitiesInput>, TenantUncheckedUpdateWithoutLegalEntitiesInput>
  }

  export type BusinessUnitUpdateManyWithoutLegalEntityNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput> | BusinessUnitCreateWithoutLegalEntityInput[] | BusinessUnitUncheckedCreateWithoutLegalEntityInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutLegalEntityInput | BusinessUnitCreateOrConnectWithoutLegalEntityInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutLegalEntityInput | BusinessUnitUpsertWithWhereUniqueWithoutLegalEntityInput[]
    createMany?: BusinessUnitCreateManyLegalEntityInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutLegalEntityInput | BusinessUnitUpdateWithWhereUniqueWithoutLegalEntityInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutLegalEntityInput | BusinessUnitUpdateManyWithWhereWithoutLegalEntityInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type BusinessUnitUncheckedUpdateManyWithoutLegalEntityNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput> | BusinessUnitCreateWithoutLegalEntityInput[] | BusinessUnitUncheckedCreateWithoutLegalEntityInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutLegalEntityInput | BusinessUnitCreateOrConnectWithoutLegalEntityInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutLegalEntityInput | BusinessUnitUpsertWithWhereUniqueWithoutLegalEntityInput[]
    createMany?: BusinessUnitCreateManyLegalEntityInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutLegalEntityInput | BusinessUnitUpdateWithWhereUniqueWithoutLegalEntityInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutLegalEntityInput | BusinessUnitUpdateManyWithWhereWithoutLegalEntityInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type TenantCreateNestedOneWithoutBusinessUnitsInput = {
    create?: XOR<TenantCreateWithoutBusinessUnitsInput, TenantUncheckedCreateWithoutBusinessUnitsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutBusinessUnitsInput
    connect?: TenantWhereUniqueInput
  }

  export type LegalEntityCreateNestedOneWithoutBusinessUnitsInput = {
    create?: XOR<LegalEntityCreateWithoutBusinessUnitsInput, LegalEntityUncheckedCreateWithoutBusinessUnitsInput>
    connectOrCreate?: LegalEntityCreateOrConnectWithoutBusinessUnitsInput
    connect?: LegalEntityWhereUniqueInput
  }

  export type BusinessUnitCreateNestedOneWithoutChildrenInput = {
    create?: XOR<BusinessUnitCreateWithoutChildrenInput, BusinessUnitUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutChildrenInput
    connect?: BusinessUnitWhereUniqueInput
  }

  export type BusinessUnitCreateNestedManyWithoutParentInput = {
    create?: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput> | BusinessUnitCreateWithoutParentInput[] | BusinessUnitUncheckedCreateWithoutParentInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutParentInput | BusinessUnitCreateOrConnectWithoutParentInput[]
    createMany?: BusinessUnitCreateManyParentInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type BranchCreateNestedManyWithoutBusinessUnitInput = {
    create?: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput> | BranchCreateWithoutBusinessUnitInput[] | BranchUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutBusinessUnitInput | BranchCreateOrConnectWithoutBusinessUnitInput[]
    createMany?: BranchCreateManyBusinessUnitInputEnvelope
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
  }

  export type FactoryCreateNestedManyWithoutBusinessUnitInput = {
    create?: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput> | FactoryCreateWithoutBusinessUnitInput[] | FactoryUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutBusinessUnitInput | FactoryCreateOrConnectWithoutBusinessUnitInput[]
    createMany?: FactoryCreateManyBusinessUnitInputEnvelope
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
  }

  export type BusinessUnitUncheckedCreateNestedManyWithoutParentInput = {
    create?: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput> | BusinessUnitCreateWithoutParentInput[] | BusinessUnitUncheckedCreateWithoutParentInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutParentInput | BusinessUnitCreateOrConnectWithoutParentInput[]
    createMany?: BusinessUnitCreateManyParentInputEnvelope
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
  }

  export type BranchUncheckedCreateNestedManyWithoutBusinessUnitInput = {
    create?: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput> | BranchCreateWithoutBusinessUnitInput[] | BranchUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutBusinessUnitInput | BranchCreateOrConnectWithoutBusinessUnitInput[]
    createMany?: BranchCreateManyBusinessUnitInputEnvelope
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
  }

  export type FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput = {
    create?: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput> | FactoryCreateWithoutBusinessUnitInput[] | FactoryUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutBusinessUnitInput | FactoryCreateOrConnectWithoutBusinessUnitInput[]
    createMany?: FactoryCreateManyBusinessUnitInputEnvelope
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
  }

  export type TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput = {
    create?: XOR<TenantCreateWithoutBusinessUnitsInput, TenantUncheckedCreateWithoutBusinessUnitsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutBusinessUnitsInput
    upsert?: TenantUpsertWithoutBusinessUnitsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutBusinessUnitsInput, TenantUpdateWithoutBusinessUnitsInput>, TenantUncheckedUpdateWithoutBusinessUnitsInput>
  }

  export type LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput = {
    create?: XOR<LegalEntityCreateWithoutBusinessUnitsInput, LegalEntityUncheckedCreateWithoutBusinessUnitsInput>
    connectOrCreate?: LegalEntityCreateOrConnectWithoutBusinessUnitsInput
    upsert?: LegalEntityUpsertWithoutBusinessUnitsInput
    connect?: LegalEntityWhereUniqueInput
    update?: XOR<XOR<LegalEntityUpdateToOneWithWhereWithoutBusinessUnitsInput, LegalEntityUpdateWithoutBusinessUnitsInput>, LegalEntityUncheckedUpdateWithoutBusinessUnitsInput>
  }

  export type BusinessUnitUpdateOneWithoutChildrenNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutChildrenInput, BusinessUnitUncheckedCreateWithoutChildrenInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutChildrenInput
    upsert?: BusinessUnitUpsertWithoutChildrenInput
    disconnect?: BusinessUnitWhereInput | boolean
    delete?: BusinessUnitWhereInput | boolean
    connect?: BusinessUnitWhereUniqueInput
    update?: XOR<XOR<BusinessUnitUpdateToOneWithWhereWithoutChildrenInput, BusinessUnitUpdateWithoutChildrenInput>, BusinessUnitUncheckedUpdateWithoutChildrenInput>
  }

  export type BusinessUnitUpdateManyWithoutParentNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput> | BusinessUnitCreateWithoutParentInput[] | BusinessUnitUncheckedCreateWithoutParentInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutParentInput | BusinessUnitCreateOrConnectWithoutParentInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutParentInput | BusinessUnitUpsertWithWhereUniqueWithoutParentInput[]
    createMany?: BusinessUnitCreateManyParentInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutParentInput | BusinessUnitUpdateWithWhereUniqueWithoutParentInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutParentInput | BusinessUnitUpdateManyWithWhereWithoutParentInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type BranchUpdateManyWithoutBusinessUnitNestedInput = {
    create?: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput> | BranchCreateWithoutBusinessUnitInput[] | BranchUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutBusinessUnitInput | BranchCreateOrConnectWithoutBusinessUnitInput[]
    upsert?: BranchUpsertWithWhereUniqueWithoutBusinessUnitInput | BranchUpsertWithWhereUniqueWithoutBusinessUnitInput[]
    createMany?: BranchCreateManyBusinessUnitInputEnvelope
    set?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    disconnect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    delete?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    update?: BranchUpdateWithWhereUniqueWithoutBusinessUnitInput | BranchUpdateWithWhereUniqueWithoutBusinessUnitInput[]
    updateMany?: BranchUpdateManyWithWhereWithoutBusinessUnitInput | BranchUpdateManyWithWhereWithoutBusinessUnitInput[]
    deleteMany?: BranchScalarWhereInput | BranchScalarWhereInput[]
  }

  export type FactoryUpdateManyWithoutBusinessUnitNestedInput = {
    create?: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput> | FactoryCreateWithoutBusinessUnitInput[] | FactoryUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutBusinessUnitInput | FactoryCreateOrConnectWithoutBusinessUnitInput[]
    upsert?: FactoryUpsertWithWhereUniqueWithoutBusinessUnitInput | FactoryUpsertWithWhereUniqueWithoutBusinessUnitInput[]
    createMany?: FactoryCreateManyBusinessUnitInputEnvelope
    set?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    disconnect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    delete?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    update?: FactoryUpdateWithWhereUniqueWithoutBusinessUnitInput | FactoryUpdateWithWhereUniqueWithoutBusinessUnitInput[]
    updateMany?: FactoryUpdateManyWithWhereWithoutBusinessUnitInput | FactoryUpdateManyWithWhereWithoutBusinessUnitInput[]
    deleteMany?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
  }

  export type BusinessUnitUncheckedUpdateManyWithoutParentNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput> | BusinessUnitCreateWithoutParentInput[] | BusinessUnitUncheckedCreateWithoutParentInput[]
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutParentInput | BusinessUnitCreateOrConnectWithoutParentInput[]
    upsert?: BusinessUnitUpsertWithWhereUniqueWithoutParentInput | BusinessUnitUpsertWithWhereUniqueWithoutParentInput[]
    createMany?: BusinessUnitCreateManyParentInputEnvelope
    set?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    disconnect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    delete?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    connect?: BusinessUnitWhereUniqueInput | BusinessUnitWhereUniqueInput[]
    update?: BusinessUnitUpdateWithWhereUniqueWithoutParentInput | BusinessUnitUpdateWithWhereUniqueWithoutParentInput[]
    updateMany?: BusinessUnitUpdateManyWithWhereWithoutParentInput | BusinessUnitUpdateManyWithWhereWithoutParentInput[]
    deleteMany?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
  }

  export type BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput = {
    create?: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput> | BranchCreateWithoutBusinessUnitInput[] | BranchUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: BranchCreateOrConnectWithoutBusinessUnitInput | BranchCreateOrConnectWithoutBusinessUnitInput[]
    upsert?: BranchUpsertWithWhereUniqueWithoutBusinessUnitInput | BranchUpsertWithWhereUniqueWithoutBusinessUnitInput[]
    createMany?: BranchCreateManyBusinessUnitInputEnvelope
    set?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    disconnect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    delete?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    connect?: BranchWhereUniqueInput | BranchWhereUniqueInput[]
    update?: BranchUpdateWithWhereUniqueWithoutBusinessUnitInput | BranchUpdateWithWhereUniqueWithoutBusinessUnitInput[]
    updateMany?: BranchUpdateManyWithWhereWithoutBusinessUnitInput | BranchUpdateManyWithWhereWithoutBusinessUnitInput[]
    deleteMany?: BranchScalarWhereInput | BranchScalarWhereInput[]
  }

  export type FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput = {
    create?: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput> | FactoryCreateWithoutBusinessUnitInput[] | FactoryUncheckedCreateWithoutBusinessUnitInput[]
    connectOrCreate?: FactoryCreateOrConnectWithoutBusinessUnitInput | FactoryCreateOrConnectWithoutBusinessUnitInput[]
    upsert?: FactoryUpsertWithWhereUniqueWithoutBusinessUnitInput | FactoryUpsertWithWhereUniqueWithoutBusinessUnitInput[]
    createMany?: FactoryCreateManyBusinessUnitInputEnvelope
    set?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    disconnect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    delete?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    connect?: FactoryWhereUniqueInput | FactoryWhereUniqueInput[]
    update?: FactoryUpdateWithWhereUniqueWithoutBusinessUnitInput | FactoryUpdateWithWhereUniqueWithoutBusinessUnitInput[]
    updateMany?: FactoryUpdateManyWithWhereWithoutBusinessUnitInput | FactoryUpdateManyWithWhereWithoutBusinessUnitInput[]
    deleteMany?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
  }

  export type TenantCreateNestedOneWithoutBranchesInput = {
    create?: XOR<TenantCreateWithoutBranchesInput, TenantUncheckedCreateWithoutBranchesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutBranchesInput
    connect?: TenantWhereUniqueInput
  }

  export type BusinessUnitCreateNestedOneWithoutBranchesInput = {
    create?: XOR<BusinessUnitCreateWithoutBranchesInput, BusinessUnitUncheckedCreateWithoutBranchesInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutBranchesInput
    connect?: BusinessUnitWhereUniqueInput
  }

  export type TenantUpdateOneRequiredWithoutBranchesNestedInput = {
    create?: XOR<TenantCreateWithoutBranchesInput, TenantUncheckedCreateWithoutBranchesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutBranchesInput
    upsert?: TenantUpsertWithoutBranchesInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutBranchesInput, TenantUpdateWithoutBranchesInput>, TenantUncheckedUpdateWithoutBranchesInput>
  }

  export type BusinessUnitUpdateOneRequiredWithoutBranchesNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutBranchesInput, BusinessUnitUncheckedCreateWithoutBranchesInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutBranchesInput
    upsert?: BusinessUnitUpsertWithoutBranchesInput
    connect?: BusinessUnitWhereUniqueInput
    update?: XOR<XOR<BusinessUnitUpdateToOneWithWhereWithoutBranchesInput, BusinessUnitUpdateWithoutBranchesInput>, BusinessUnitUncheckedUpdateWithoutBranchesInput>
  }

  export type TenantCreateNestedOneWithoutFactoriesInput = {
    create?: XOR<TenantCreateWithoutFactoriesInput, TenantUncheckedCreateWithoutFactoriesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutFactoriesInput
    connect?: TenantWhereUniqueInput
  }

  export type BusinessUnitCreateNestedOneWithoutFactoriesInput = {
    create?: XOR<BusinessUnitCreateWithoutFactoriesInput, BusinessUnitUncheckedCreateWithoutFactoriesInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutFactoriesInput
    connect?: BusinessUnitWhereUniqueInput
  }

  export type TenantUpdateOneRequiredWithoutFactoriesNestedInput = {
    create?: XOR<TenantCreateWithoutFactoriesInput, TenantUncheckedCreateWithoutFactoriesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutFactoriesInput
    upsert?: TenantUpsertWithoutFactoriesInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutFactoriesInput, TenantUpdateWithoutFactoriesInput>, TenantUncheckedUpdateWithoutFactoriesInput>
  }

  export type BusinessUnitUpdateOneRequiredWithoutFactoriesNestedInput = {
    create?: XOR<BusinessUnitCreateWithoutFactoriesInput, BusinessUnitUncheckedCreateWithoutFactoriesInput>
    connectOrCreate?: BusinessUnitCreateOrConnectWithoutFactoriesInput
    upsert?: BusinessUnitUpsertWithoutFactoriesInput
    connect?: BusinessUnitWhereUniqueInput
    update?: XOR<XOR<BusinessUnitUpdateToOneWithWhereWithoutFactoriesInput, BusinessUnitUpdateWithoutFactoriesInput>, BusinessUnitUncheckedUpdateWithoutFactoriesInput>
  }

  export type TenantCreateNestedOneWithoutUsersInput = {
    create?: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    connectOrCreate?: TenantCreateOrConnectWithoutUsersInput
    connect?: TenantWhereUniqueInput
  }

  export type UserRoleAssignmentCreateNestedManyWithoutUserInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput> | UserRoleAssignmentCreateWithoutUserInput[] | UserRoleAssignmentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutUserInput | UserRoleAssignmentCreateOrConnectWithoutUserInput[]
    createMany?: UserRoleAssignmentCreateManyUserInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type UserRoleAssignmentUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput> | UserRoleAssignmentCreateWithoutUserInput[] | UserRoleAssignmentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutUserInput | UserRoleAssignmentCreateOrConnectWithoutUserInput[]
    createMany?: UserRoleAssignmentCreateManyUserInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type EnumUserStatusFieldUpdateOperationsInput = {
    set?: $Enums.UserStatus
  }

  export type TenantUpdateOneRequiredWithoutUsersNestedInput = {
    create?: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    connectOrCreate?: TenantCreateOrConnectWithoutUsersInput
    upsert?: TenantUpsertWithoutUsersInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutUsersInput, TenantUpdateWithoutUsersInput>, TenantUncheckedUpdateWithoutUsersInput>
  }

  export type UserRoleAssignmentUpdateManyWithoutUserNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput> | UserRoleAssignmentCreateWithoutUserInput[] | UserRoleAssignmentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutUserInput | UserRoleAssignmentCreateOrConnectWithoutUserInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutUserInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: UserRoleAssignmentCreateManyUserInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutUserInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutUserInput | UserRoleAssignmentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput> | UserRoleAssignmentCreateWithoutUserInput[] | UserRoleAssignmentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutUserInput | UserRoleAssignmentCreateOrConnectWithoutUserInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutUserInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: UserRoleAssignmentCreateManyUserInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutUserInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutUserInput | UserRoleAssignmentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type TenantCreateNestedOneWithoutRolesInput = {
    create?: XOR<TenantCreateWithoutRolesInput, TenantUncheckedCreateWithoutRolesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutRolesInput
    connect?: TenantWhereUniqueInput
  }

  export type RolePermissionCreateNestedManyWithoutRoleInput = {
    create?: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput> | RolePermissionCreateWithoutRoleInput[] | RolePermissionUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePermissionCreateOrConnectWithoutRoleInput | RolePermissionCreateOrConnectWithoutRoleInput[]
    createMany?: RolePermissionCreateManyRoleInputEnvelope
    connect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
  }

  export type UserRoleAssignmentCreateNestedManyWithoutRoleInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput> | UserRoleAssignmentCreateWithoutRoleInput[] | UserRoleAssignmentUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutRoleInput | UserRoleAssignmentCreateOrConnectWithoutRoleInput[]
    createMany?: UserRoleAssignmentCreateManyRoleInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type RolePermissionUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput> | RolePermissionCreateWithoutRoleInput[] | RolePermissionUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePermissionCreateOrConnectWithoutRoleInput | RolePermissionCreateOrConnectWithoutRoleInput[]
    createMany?: RolePermissionCreateManyRoleInputEnvelope
    connect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
  }

  export type UserRoleAssignmentUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput> | UserRoleAssignmentCreateWithoutRoleInput[] | UserRoleAssignmentUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutRoleInput | UserRoleAssignmentCreateOrConnectWithoutRoleInput[]
    createMany?: UserRoleAssignmentCreateManyRoleInputEnvelope
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
  }

  export type TenantUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<TenantCreateWithoutRolesInput, TenantUncheckedCreateWithoutRolesInput>
    connectOrCreate?: TenantCreateOrConnectWithoutRolesInput
    upsert?: TenantUpsertWithoutRolesInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutRolesInput, TenantUpdateWithoutRolesInput>, TenantUncheckedUpdateWithoutRolesInput>
  }

  export type RolePermissionUpdateManyWithoutRoleNestedInput = {
    create?: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput> | RolePermissionCreateWithoutRoleInput[] | RolePermissionUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePermissionCreateOrConnectWithoutRoleInput | RolePermissionCreateOrConnectWithoutRoleInput[]
    upsert?: RolePermissionUpsertWithWhereUniqueWithoutRoleInput | RolePermissionUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: RolePermissionCreateManyRoleInputEnvelope
    set?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    disconnect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    delete?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    connect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    update?: RolePermissionUpdateWithWhereUniqueWithoutRoleInput | RolePermissionUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: RolePermissionUpdateManyWithWhereWithoutRoleInput | RolePermissionUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: RolePermissionScalarWhereInput | RolePermissionScalarWhereInput[]
  }

  export type UserRoleAssignmentUpdateManyWithoutRoleNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput> | UserRoleAssignmentCreateWithoutRoleInput[] | UserRoleAssignmentUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutRoleInput | UserRoleAssignmentCreateOrConnectWithoutRoleInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutRoleInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: UserRoleAssignmentCreateManyRoleInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutRoleInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutRoleInput | UserRoleAssignmentUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type RolePermissionUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput> | RolePermissionCreateWithoutRoleInput[] | RolePermissionUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePermissionCreateOrConnectWithoutRoleInput | RolePermissionCreateOrConnectWithoutRoleInput[]
    upsert?: RolePermissionUpsertWithWhereUniqueWithoutRoleInput | RolePermissionUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: RolePermissionCreateManyRoleInputEnvelope
    set?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    disconnect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    delete?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    connect?: RolePermissionWhereUniqueInput | RolePermissionWhereUniqueInput[]
    update?: RolePermissionUpdateWithWhereUniqueWithoutRoleInput | RolePermissionUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: RolePermissionUpdateManyWithWhereWithoutRoleInput | RolePermissionUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: RolePermissionScalarWhereInput | RolePermissionScalarWhereInput[]
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput> | UserRoleAssignmentCreateWithoutRoleInput[] | UserRoleAssignmentUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: UserRoleAssignmentCreateOrConnectWithoutRoleInput | UserRoleAssignmentCreateOrConnectWithoutRoleInput[]
    upsert?: UserRoleAssignmentUpsertWithWhereUniqueWithoutRoleInput | UserRoleAssignmentUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: UserRoleAssignmentCreateManyRoleInputEnvelope
    set?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    disconnect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    delete?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    connect?: UserRoleAssignmentWhereUniqueInput | UserRoleAssignmentWhereUniqueInput[]
    update?: UserRoleAssignmentUpdateWithWhereUniqueWithoutRoleInput | UserRoleAssignmentUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: UserRoleAssignmentUpdateManyWithWhereWithoutRoleInput | UserRoleAssignmentUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
  }

  export type RoleCreateNestedOneWithoutPermissionsInput = {
    create?: XOR<RoleCreateWithoutPermissionsInput, RoleUncheckedCreateWithoutPermissionsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPermissionsInput
    connect?: RoleWhereUniqueInput
  }

  export type RoleUpdateOneRequiredWithoutPermissionsNestedInput = {
    create?: XOR<RoleCreateWithoutPermissionsInput, RoleUncheckedCreateWithoutPermissionsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPermissionsInput
    upsert?: RoleUpsertWithoutPermissionsInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutPermissionsInput, RoleUpdateWithoutPermissionsInput>, RoleUncheckedUpdateWithoutPermissionsInput>
  }

  export type TenantCreateNestedOneWithoutRoleAssignmentsInput = {
    create?: XOR<TenantCreateWithoutRoleAssignmentsInput, TenantUncheckedCreateWithoutRoleAssignmentsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutRoleAssignmentsInput
    connect?: TenantWhereUniqueInput
  }

  export type UserCreateNestedOneWithoutRoleAssignmentsInput = {
    create?: XOR<UserCreateWithoutRoleAssignmentsInput, UserUncheckedCreateWithoutRoleAssignmentsInput>
    connectOrCreate?: UserCreateOrConnectWithoutRoleAssignmentsInput
    connect?: UserWhereUniqueInput
  }

  export type RoleCreateNestedOneWithoutAssignmentsInput = {
    create?: XOR<RoleCreateWithoutAssignmentsInput, RoleUncheckedCreateWithoutAssignmentsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutAssignmentsInput
    connect?: RoleWhereUniqueInput
  }

  export type EnumScopeTypeFieldUpdateOperationsInput = {
    set?: $Enums.ScopeType
  }

  export type TenantUpdateOneRequiredWithoutRoleAssignmentsNestedInput = {
    create?: XOR<TenantCreateWithoutRoleAssignmentsInput, TenantUncheckedCreateWithoutRoleAssignmentsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutRoleAssignmentsInput
    upsert?: TenantUpsertWithoutRoleAssignmentsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutRoleAssignmentsInput, TenantUpdateWithoutRoleAssignmentsInput>, TenantUncheckedUpdateWithoutRoleAssignmentsInput>
  }

  export type UserUpdateOneRequiredWithoutRoleAssignmentsNestedInput = {
    create?: XOR<UserCreateWithoutRoleAssignmentsInput, UserUncheckedCreateWithoutRoleAssignmentsInput>
    connectOrCreate?: UserCreateOrConnectWithoutRoleAssignmentsInput
    upsert?: UserUpsertWithoutRoleAssignmentsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutRoleAssignmentsInput, UserUpdateWithoutRoleAssignmentsInput>, UserUncheckedUpdateWithoutRoleAssignmentsInput>
  }

  export type RoleUpdateOneRequiredWithoutAssignmentsNestedInput = {
    create?: XOR<RoleCreateWithoutAssignmentsInput, RoleUncheckedCreateWithoutAssignmentsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutAssignmentsInput
    upsert?: RoleUpsertWithoutAssignmentsInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutAssignmentsInput, RoleUpdateWithoutAssignmentsInput>, RoleUncheckedUpdateWithoutAssignmentsInput>
  }

  export type TenantCreateNestedOneWithoutAuditEventsInput = {
    create?: XOR<TenantCreateWithoutAuditEventsInput, TenantUncheckedCreateWithoutAuditEventsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutAuditEventsInput
    connect?: TenantWhereUniqueInput
  }

  export type EnumActorTypeFieldUpdateOperationsInput = {
    set?: $Enums.ActorType
  }

  export type TenantUpdateOneRequiredWithoutAuditEventsNestedInput = {
    create?: XOR<TenantCreateWithoutAuditEventsInput, TenantUncheckedCreateWithoutAuditEventsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutAuditEventsInput
    upsert?: TenantUpsertWithoutAuditEventsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutAuditEventsInput, TenantUpdateWithoutAuditEventsInput>, TenantUncheckedUpdateWithoutAuditEventsInput>
  }

  export type TenantCreateNestedOneWithoutOutboxEventsInput = {
    create?: XOR<TenantCreateWithoutOutboxEventsInput, TenantUncheckedCreateWithoutOutboxEventsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutOutboxEventsInput
    connect?: TenantWhereUniqueInput
  }

  export type EnumOutboxStatusFieldUpdateOperationsInput = {
    set?: $Enums.OutboxStatus
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type TenantUpdateOneRequiredWithoutOutboxEventsNestedInput = {
    create?: XOR<TenantCreateWithoutOutboxEventsInput, TenantUncheckedCreateWithoutOutboxEventsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutOutboxEventsInput
    upsert?: TenantUpsertWithoutOutboxEventsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutOutboxEventsInput, TenantUpdateWithoutOutboxEventsInput>, TenantUncheckedUpdateWithoutOutboxEventsInput>
  }

  export type NestedUuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedEnumTenantStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TenantStatus | EnumTenantStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTenantStatusFilter<$PrismaModel> | $Enums.TenantStatus
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedUuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedEnumTenantStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TenantStatus | EnumTenantStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TenantStatus[] | ListEnumTenantStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTenantStatusWithAggregatesFilter<$PrismaModel> | $Enums.TenantStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTenantStatusFilter<$PrismaModel>
    _max?: NestedEnumTenantStatusFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedUuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedUuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedEnumUserStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.UserStatus | EnumUserStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUserStatusFilter<$PrismaModel> | $Enums.UserStatus
  }

  export type NestedEnumUserStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.UserStatus | EnumUserStatusFieldRefInput<$PrismaModel>
    in?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.UserStatus[] | ListEnumUserStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumUserStatusWithAggregatesFilter<$PrismaModel> | $Enums.UserStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumUserStatusFilter<$PrismaModel>
    _max?: NestedEnumUserStatusFilter<$PrismaModel>
  }

  export type NestedEnumScopeTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.ScopeType | EnumScopeTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumScopeTypeFilter<$PrismaModel> | $Enums.ScopeType
  }

  export type NestedEnumScopeTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ScopeType | EnumScopeTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ScopeType[] | ListEnumScopeTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumScopeTypeWithAggregatesFilter<$PrismaModel> | $Enums.ScopeType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumScopeTypeFilter<$PrismaModel>
    _max?: NestedEnumScopeTypeFilter<$PrismaModel>
  }

  export type NestedEnumActorTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.ActorType | EnumActorTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumActorTypeFilter<$PrismaModel> | $Enums.ActorType
  }

  export type NestedEnumActorTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ActorType | EnumActorTypeFieldRefInput<$PrismaModel>
    in?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.ActorType[] | ListEnumActorTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumActorTypeWithAggregatesFilter<$PrismaModel> | $Enums.ActorType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumActorTypeFilter<$PrismaModel>
    _max?: NestedEnumActorTypeFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedEnumOutboxStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.OutboxStatus | EnumOutboxStatusFieldRefInput<$PrismaModel>
    in?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumOutboxStatusFilter<$PrismaModel> | $Enums.OutboxStatus
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedEnumOutboxStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.OutboxStatus | EnumOutboxStatusFieldRefInput<$PrismaModel>
    in?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.OutboxStatus[] | ListEnumOutboxStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumOutboxStatusWithAggregatesFilter<$PrismaModel> | $Enums.OutboxStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumOutboxStatusFilter<$PrismaModel>
    _max?: NestedEnumOutboxStatusFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type TenantConfigurationVersionCreateWithoutTenantInput = {
    id?: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
  }

  export type TenantConfigurationVersionUncheckedCreateWithoutTenantInput = {
    id?: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
  }

  export type TenantConfigurationVersionCreateOrConnectWithoutTenantInput = {
    where: TenantConfigurationVersionWhereUniqueInput
    create: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput>
  }

  export type TenantConfigurationVersionCreateManyTenantInputEnvelope = {
    data: TenantConfigurationVersionCreateManyTenantInput | TenantConfigurationVersionCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type LegalEntityCreateWithoutTenantInput = {
    id?: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    businessUnits?: BusinessUnitCreateNestedManyWithoutLegalEntityInput
  }

  export type LegalEntityUncheckedCreateWithoutTenantInput = {
    id?: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutLegalEntityInput
  }

  export type LegalEntityCreateOrConnectWithoutTenantInput = {
    where: LegalEntityWhereUniqueInput
    create: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput>
  }

  export type LegalEntityCreateManyTenantInputEnvelope = {
    data: LegalEntityCreateManyTenantInput | LegalEntityCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type BusinessUnitCreateWithoutTenantInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutTenantInput = {
    id?: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutTenantInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput>
  }

  export type BusinessUnitCreateManyTenantInputEnvelope = {
    data: BusinessUnitCreateManyTenantInput | BusinessUnitCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type BranchCreateWithoutTenantInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    businessUnit: BusinessUnitCreateNestedOneWithoutBranchesInput
  }

  export type BranchUncheckedCreateWithoutTenantInput = {
    id?: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchCreateOrConnectWithoutTenantInput = {
    where: BranchWhereUniqueInput
    create: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput>
  }

  export type BranchCreateManyTenantInputEnvelope = {
    data: BranchCreateManyTenantInput | BranchCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type FactoryCreateWithoutTenantInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    businessUnit: BusinessUnitCreateNestedOneWithoutFactoriesInput
  }

  export type FactoryUncheckedCreateWithoutTenantInput = {
    id?: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryCreateOrConnectWithoutTenantInput = {
    where: FactoryWhereUniqueInput
    create: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput>
  }

  export type FactoryCreateManyTenantInputEnvelope = {
    data: FactoryCreateManyTenantInput | FactoryCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type UserCreateWithoutTenantInput = {
    id?: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutTenantInput = {
    id?: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutTenantInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput>
  }

  export type UserCreateManyTenantInputEnvelope = {
    data: UserCreateManyTenantInput | UserCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type RoleCreateWithoutTenantInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    permissions?: RolePermissionCreateNestedManyWithoutRoleInput
    assignments?: UserRoleAssignmentCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutTenantInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    permissions?: RolePermissionUncheckedCreateNestedManyWithoutRoleInput
    assignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutTenantInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput>
  }

  export type RoleCreateManyTenantInputEnvelope = {
    data: RoleCreateManyTenantInput | RoleCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type UserRoleAssignmentCreateWithoutTenantInput = {
    id?: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
    user: UserCreateNestedOneWithoutRoleAssignmentsInput
    role: RoleCreateNestedOneWithoutAssignmentsInput
  }

  export type UserRoleAssignmentUncheckedCreateWithoutTenantInput = {
    id?: string
    userId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentCreateOrConnectWithoutTenantInput = {
    where: UserRoleAssignmentWhereUniqueInput
    create: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput>
  }

  export type UserRoleAssignmentCreateManyTenantInputEnvelope = {
    data: UserRoleAssignmentCreateManyTenantInput | UserRoleAssignmentCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type AuditEventCreateWithoutTenantInput = {
    id?: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
  }

  export type AuditEventUncheckedCreateWithoutTenantInput = {
    id?: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
  }

  export type AuditEventCreateOrConnectWithoutTenantInput = {
    where: AuditEventWhereUniqueInput
    create: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput>
  }

  export type AuditEventCreateManyTenantInputEnvelope = {
    data: AuditEventCreateManyTenantInput | AuditEventCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type OutboxEventCreateWithoutTenantInput = {
    id?: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
  }

  export type OutboxEventUncheckedCreateWithoutTenantInput = {
    id?: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
  }

  export type OutboxEventCreateOrConnectWithoutTenantInput = {
    where: OutboxEventWhereUniqueInput
    create: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput>
  }

  export type OutboxEventCreateManyTenantInputEnvelope = {
    data: OutboxEventCreateManyTenantInput | OutboxEventCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type TenantConfigurationVersionUpsertWithWhereUniqueWithoutTenantInput = {
    where: TenantConfigurationVersionWhereUniqueInput
    update: XOR<TenantConfigurationVersionUpdateWithoutTenantInput, TenantConfigurationVersionUncheckedUpdateWithoutTenantInput>
    create: XOR<TenantConfigurationVersionCreateWithoutTenantInput, TenantConfigurationVersionUncheckedCreateWithoutTenantInput>
  }

  export type TenantConfigurationVersionUpdateWithWhereUniqueWithoutTenantInput = {
    where: TenantConfigurationVersionWhereUniqueInput
    data: XOR<TenantConfigurationVersionUpdateWithoutTenantInput, TenantConfigurationVersionUncheckedUpdateWithoutTenantInput>
  }

  export type TenantConfigurationVersionUpdateManyWithWhereWithoutTenantInput = {
    where: TenantConfigurationVersionScalarWhereInput
    data: XOR<TenantConfigurationVersionUpdateManyMutationInput, TenantConfigurationVersionUncheckedUpdateManyWithoutTenantInput>
  }

  export type TenantConfigurationVersionScalarWhereInput = {
    AND?: TenantConfigurationVersionScalarWhereInput | TenantConfigurationVersionScalarWhereInput[]
    OR?: TenantConfigurationVersionScalarWhereInput[]
    NOT?: TenantConfigurationVersionScalarWhereInput | TenantConfigurationVersionScalarWhereInput[]
    id?: UuidFilter<"TenantConfigurationVersion"> | string
    tenantId?: UuidFilter<"TenantConfigurationVersion"> | string
    version?: IntFilter<"TenantConfigurationVersion"> | number
    config?: JsonFilter<"TenantConfigurationVersion">
    publishedAt?: DateTimeFilter<"TenantConfigurationVersion"> | Date | string
    publishedBy?: UuidNullableFilter<"TenantConfigurationVersion"> | string | null
  }

  export type LegalEntityUpsertWithWhereUniqueWithoutTenantInput = {
    where: LegalEntityWhereUniqueInput
    update: XOR<LegalEntityUpdateWithoutTenantInput, LegalEntityUncheckedUpdateWithoutTenantInput>
    create: XOR<LegalEntityCreateWithoutTenantInput, LegalEntityUncheckedCreateWithoutTenantInput>
  }

  export type LegalEntityUpdateWithWhereUniqueWithoutTenantInput = {
    where: LegalEntityWhereUniqueInput
    data: XOR<LegalEntityUpdateWithoutTenantInput, LegalEntityUncheckedUpdateWithoutTenantInput>
  }

  export type LegalEntityUpdateManyWithWhereWithoutTenantInput = {
    where: LegalEntityScalarWhereInput
    data: XOR<LegalEntityUpdateManyMutationInput, LegalEntityUncheckedUpdateManyWithoutTenantInput>
  }

  export type LegalEntityScalarWhereInput = {
    AND?: LegalEntityScalarWhereInput | LegalEntityScalarWhereInput[]
    OR?: LegalEntityScalarWhereInput[]
    NOT?: LegalEntityScalarWhereInput | LegalEntityScalarWhereInput[]
    id?: UuidFilter<"LegalEntity"> | string
    tenantId?: UuidFilter<"LegalEntity"> | string
    name?: StringFilter<"LegalEntity"> | string
    code?: StringNullableFilter<"LegalEntity"> | string | null
    createdAt?: DateTimeFilter<"LegalEntity"> | Date | string
    updatedAt?: DateTimeFilter<"LegalEntity"> | Date | string
  }

  export type BusinessUnitUpsertWithWhereUniqueWithoutTenantInput = {
    where: BusinessUnitWhereUniqueInput
    update: XOR<BusinessUnitUpdateWithoutTenantInput, BusinessUnitUncheckedUpdateWithoutTenantInput>
    create: XOR<BusinessUnitCreateWithoutTenantInput, BusinessUnitUncheckedCreateWithoutTenantInput>
  }

  export type BusinessUnitUpdateWithWhereUniqueWithoutTenantInput = {
    where: BusinessUnitWhereUniqueInput
    data: XOR<BusinessUnitUpdateWithoutTenantInput, BusinessUnitUncheckedUpdateWithoutTenantInput>
  }

  export type BusinessUnitUpdateManyWithWhereWithoutTenantInput = {
    where: BusinessUnitScalarWhereInput
    data: XOR<BusinessUnitUpdateManyMutationInput, BusinessUnitUncheckedUpdateManyWithoutTenantInput>
  }

  export type BusinessUnitScalarWhereInput = {
    AND?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
    OR?: BusinessUnitScalarWhereInput[]
    NOT?: BusinessUnitScalarWhereInput | BusinessUnitScalarWhereInput[]
    id?: UuidFilter<"BusinessUnit"> | string
    tenantId?: UuidFilter<"BusinessUnit"> | string
    legalEntityId?: UuidFilter<"BusinessUnit"> | string
    parentId?: UuidNullableFilter<"BusinessUnit"> | string | null
    name?: StringFilter<"BusinessUnit"> | string
    createdAt?: DateTimeFilter<"BusinessUnit"> | Date | string
    updatedAt?: DateTimeFilter<"BusinessUnit"> | Date | string
  }

  export type BranchUpsertWithWhereUniqueWithoutTenantInput = {
    where: BranchWhereUniqueInput
    update: XOR<BranchUpdateWithoutTenantInput, BranchUncheckedUpdateWithoutTenantInput>
    create: XOR<BranchCreateWithoutTenantInput, BranchUncheckedCreateWithoutTenantInput>
  }

  export type BranchUpdateWithWhereUniqueWithoutTenantInput = {
    where: BranchWhereUniqueInput
    data: XOR<BranchUpdateWithoutTenantInput, BranchUncheckedUpdateWithoutTenantInput>
  }

  export type BranchUpdateManyWithWhereWithoutTenantInput = {
    where: BranchScalarWhereInput
    data: XOR<BranchUpdateManyMutationInput, BranchUncheckedUpdateManyWithoutTenantInput>
  }

  export type BranchScalarWhereInput = {
    AND?: BranchScalarWhereInput | BranchScalarWhereInput[]
    OR?: BranchScalarWhereInput[]
    NOT?: BranchScalarWhereInput | BranchScalarWhereInput[]
    id?: UuidFilter<"Branch"> | string
    tenantId?: UuidFilter<"Branch"> | string
    businessUnitId?: UuidFilter<"Branch"> | string
    name?: StringFilter<"Branch"> | string
    createdAt?: DateTimeFilter<"Branch"> | Date | string
    updatedAt?: DateTimeFilter<"Branch"> | Date | string
  }

  export type FactoryUpsertWithWhereUniqueWithoutTenantInput = {
    where: FactoryWhereUniqueInput
    update: XOR<FactoryUpdateWithoutTenantInput, FactoryUncheckedUpdateWithoutTenantInput>
    create: XOR<FactoryCreateWithoutTenantInput, FactoryUncheckedCreateWithoutTenantInput>
  }

  export type FactoryUpdateWithWhereUniqueWithoutTenantInput = {
    where: FactoryWhereUniqueInput
    data: XOR<FactoryUpdateWithoutTenantInput, FactoryUncheckedUpdateWithoutTenantInput>
  }

  export type FactoryUpdateManyWithWhereWithoutTenantInput = {
    where: FactoryScalarWhereInput
    data: XOR<FactoryUpdateManyMutationInput, FactoryUncheckedUpdateManyWithoutTenantInput>
  }

  export type FactoryScalarWhereInput = {
    AND?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
    OR?: FactoryScalarWhereInput[]
    NOT?: FactoryScalarWhereInput | FactoryScalarWhereInput[]
    id?: UuidFilter<"Factory"> | string
    tenantId?: UuidFilter<"Factory"> | string
    businessUnitId?: UuidFilter<"Factory"> | string
    name?: StringFilter<"Factory"> | string
    createdAt?: DateTimeFilter<"Factory"> | Date | string
    updatedAt?: DateTimeFilter<"Factory"> | Date | string
  }

  export type UserUpsertWithWhereUniqueWithoutTenantInput = {
    where: UserWhereUniqueInput
    update: XOR<UserUpdateWithoutTenantInput, UserUncheckedUpdateWithoutTenantInput>
    create: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput>
  }

  export type UserUpdateWithWhereUniqueWithoutTenantInput = {
    where: UserWhereUniqueInput
    data: XOR<UserUpdateWithoutTenantInput, UserUncheckedUpdateWithoutTenantInput>
  }

  export type UserUpdateManyWithWhereWithoutTenantInput = {
    where: UserScalarWhereInput
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyWithoutTenantInput>
  }

  export type UserScalarWhereInput = {
    AND?: UserScalarWhereInput | UserScalarWhereInput[]
    OR?: UserScalarWhereInput[]
    NOT?: UserScalarWhereInput | UserScalarWhereInput[]
    id?: UuidFilter<"User"> | string
    tenantId?: UuidFilter<"User"> | string
    email?: StringFilter<"User"> | string
    displayName?: StringFilter<"User"> | string
    status?: EnumUserStatusFilter<"User"> | $Enums.UserStatus
    idpSubject?: StringNullableFilter<"User"> | string | null
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
  }

  export type RoleUpsertWithWhereUniqueWithoutTenantInput = {
    where: RoleWhereUniqueInput
    update: XOR<RoleUpdateWithoutTenantInput, RoleUncheckedUpdateWithoutTenantInput>
    create: XOR<RoleCreateWithoutTenantInput, RoleUncheckedCreateWithoutTenantInput>
  }

  export type RoleUpdateWithWhereUniqueWithoutTenantInput = {
    where: RoleWhereUniqueInput
    data: XOR<RoleUpdateWithoutTenantInput, RoleUncheckedUpdateWithoutTenantInput>
  }

  export type RoleUpdateManyWithWhereWithoutTenantInput = {
    where: RoleScalarWhereInput
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyWithoutTenantInput>
  }

  export type RoleScalarWhereInput = {
    AND?: RoleScalarWhereInput | RoleScalarWhereInput[]
    OR?: RoleScalarWhereInput[]
    NOT?: RoleScalarWhereInput | RoleScalarWhereInput[]
    id?: UuidFilter<"Role"> | string
    tenantId?: UuidFilter<"Role"> | string
    name?: StringFilter<"Role"> | string
    description?: StringNullableFilter<"Role"> | string | null
    createdAt?: DateTimeFilter<"Role"> | Date | string
    updatedAt?: DateTimeFilter<"Role"> | Date | string
  }

  export type UserRoleAssignmentUpsertWithWhereUniqueWithoutTenantInput = {
    where: UserRoleAssignmentWhereUniqueInput
    update: XOR<UserRoleAssignmentUpdateWithoutTenantInput, UserRoleAssignmentUncheckedUpdateWithoutTenantInput>
    create: XOR<UserRoleAssignmentCreateWithoutTenantInput, UserRoleAssignmentUncheckedCreateWithoutTenantInput>
  }

  export type UserRoleAssignmentUpdateWithWhereUniqueWithoutTenantInput = {
    where: UserRoleAssignmentWhereUniqueInput
    data: XOR<UserRoleAssignmentUpdateWithoutTenantInput, UserRoleAssignmentUncheckedUpdateWithoutTenantInput>
  }

  export type UserRoleAssignmentUpdateManyWithWhereWithoutTenantInput = {
    where: UserRoleAssignmentScalarWhereInput
    data: XOR<UserRoleAssignmentUpdateManyMutationInput, UserRoleAssignmentUncheckedUpdateManyWithoutTenantInput>
  }

  export type UserRoleAssignmentScalarWhereInput = {
    AND?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
    OR?: UserRoleAssignmentScalarWhereInput[]
    NOT?: UserRoleAssignmentScalarWhereInput | UserRoleAssignmentScalarWhereInput[]
    id?: UuidFilter<"UserRoleAssignment"> | string
    tenantId?: UuidFilter<"UserRoleAssignment"> | string
    userId?: UuidFilter<"UserRoleAssignment"> | string
    roleId?: UuidFilter<"UserRoleAssignment"> | string
    scopeType?: EnumScopeTypeFilter<"UserRoleAssignment"> | $Enums.ScopeType
    scopeId?: UuidFilter<"UserRoleAssignment"> | string
    createdAt?: DateTimeFilter<"UserRoleAssignment"> | Date | string
  }

  export type AuditEventUpsertWithWhereUniqueWithoutTenantInput = {
    where: AuditEventWhereUniqueInput
    update: XOR<AuditEventUpdateWithoutTenantInput, AuditEventUncheckedUpdateWithoutTenantInput>
    create: XOR<AuditEventCreateWithoutTenantInput, AuditEventUncheckedCreateWithoutTenantInput>
  }

  export type AuditEventUpdateWithWhereUniqueWithoutTenantInput = {
    where: AuditEventWhereUniqueInput
    data: XOR<AuditEventUpdateWithoutTenantInput, AuditEventUncheckedUpdateWithoutTenantInput>
  }

  export type AuditEventUpdateManyWithWhereWithoutTenantInput = {
    where: AuditEventScalarWhereInput
    data: XOR<AuditEventUpdateManyMutationInput, AuditEventUncheckedUpdateManyWithoutTenantInput>
  }

  export type AuditEventScalarWhereInput = {
    AND?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
    OR?: AuditEventScalarWhereInput[]
    NOT?: AuditEventScalarWhereInput | AuditEventScalarWhereInput[]
    id?: UuidFilter<"AuditEvent"> | string
    tenantId?: UuidFilter<"AuditEvent"> | string
    actorType?: EnumActorTypeFilter<"AuditEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"AuditEvent"> | string | null
    action?: StringFilter<"AuditEvent"> | string
    objectType?: StringFilter<"AuditEvent"> | string
    objectId?: StringFilter<"AuditEvent"> | string
    occurredAt?: DateTimeFilter<"AuditEvent"> | Date | string
    correlationId?: StringFilter<"AuditEvent"> | string
    source?: StringFilter<"AuditEvent"> | string
    previousValues?: JsonNullableFilter<"AuditEvent">
    newValues?: JsonNullableFilter<"AuditEvent">
    reason?: StringNullableFilter<"AuditEvent"> | string | null
  }

  export type OutboxEventUpsertWithWhereUniqueWithoutTenantInput = {
    where: OutboxEventWhereUniqueInput
    update: XOR<OutboxEventUpdateWithoutTenantInput, OutboxEventUncheckedUpdateWithoutTenantInput>
    create: XOR<OutboxEventCreateWithoutTenantInput, OutboxEventUncheckedCreateWithoutTenantInput>
  }

  export type OutboxEventUpdateWithWhereUniqueWithoutTenantInput = {
    where: OutboxEventWhereUniqueInput
    data: XOR<OutboxEventUpdateWithoutTenantInput, OutboxEventUncheckedUpdateWithoutTenantInput>
  }

  export type OutboxEventUpdateManyWithWhereWithoutTenantInput = {
    where: OutboxEventScalarWhereInput
    data: XOR<OutboxEventUpdateManyMutationInput, OutboxEventUncheckedUpdateManyWithoutTenantInput>
  }

  export type OutboxEventScalarWhereInput = {
    AND?: OutboxEventScalarWhereInput | OutboxEventScalarWhereInput[]
    OR?: OutboxEventScalarWhereInput[]
    NOT?: OutboxEventScalarWhereInput | OutboxEventScalarWhereInput[]
    id?: UuidFilter<"OutboxEvent"> | string
    tenantId?: UuidFilter<"OutboxEvent"> | string
    eventType?: StringFilter<"OutboxEvent"> | string
    eventVersion?: IntFilter<"OutboxEvent"> | number
    aggregateType?: StringFilter<"OutboxEvent"> | string
    aggregateId?: StringFilter<"OutboxEvent"> | string
    occurredAt?: DateTimeFilter<"OutboxEvent"> | Date | string
    actorType?: EnumActorTypeFilter<"OutboxEvent"> | $Enums.ActorType
    actorId?: StringNullableFilter<"OutboxEvent"> | string | null
    correlationId?: StringFilter<"OutboxEvent"> | string
    causationId?: StringNullableFilter<"OutboxEvent"> | string | null
    payload?: JsonFilter<"OutboxEvent">
    status?: EnumOutboxStatusFilter<"OutboxEvent"> | $Enums.OutboxStatus
    attempts?: IntFilter<"OutboxEvent"> | number
    dispatchedAt?: DateTimeNullableFilter<"OutboxEvent"> | Date | string | null
    lastError?: StringNullableFilter<"OutboxEvent"> | string | null
  }

  export type TenantCreateWithoutConfigurationVersionsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutConfigurationVersionsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutConfigurationVersionsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutConfigurationVersionsInput, TenantUncheckedCreateWithoutConfigurationVersionsInput>
  }

  export type TenantUpsertWithoutConfigurationVersionsInput = {
    update: XOR<TenantUpdateWithoutConfigurationVersionsInput, TenantUncheckedUpdateWithoutConfigurationVersionsInput>
    create: XOR<TenantCreateWithoutConfigurationVersionsInput, TenantUncheckedCreateWithoutConfigurationVersionsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutConfigurationVersionsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutConfigurationVersionsInput, TenantUncheckedUpdateWithoutConfigurationVersionsInput>
  }

  export type TenantUpdateWithoutConfigurationVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutConfigurationVersionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantCreateWithoutLegalEntitiesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutLegalEntitiesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutLegalEntitiesInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutLegalEntitiesInput, TenantUncheckedCreateWithoutLegalEntitiesInput>
  }

  export type BusinessUnitCreateWithoutLegalEntityInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutLegalEntityInput = {
    id?: string
    tenantId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutLegalEntityInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput>
  }

  export type BusinessUnitCreateManyLegalEntityInputEnvelope = {
    data: BusinessUnitCreateManyLegalEntityInput | BusinessUnitCreateManyLegalEntityInput[]
    skipDuplicates?: boolean
  }

  export type TenantUpsertWithoutLegalEntitiesInput = {
    update: XOR<TenantUpdateWithoutLegalEntitiesInput, TenantUncheckedUpdateWithoutLegalEntitiesInput>
    create: XOR<TenantCreateWithoutLegalEntitiesInput, TenantUncheckedCreateWithoutLegalEntitiesInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutLegalEntitiesInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutLegalEntitiesInput, TenantUncheckedUpdateWithoutLegalEntitiesInput>
  }

  export type TenantUpdateWithoutLegalEntitiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutLegalEntitiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type BusinessUnitUpsertWithWhereUniqueWithoutLegalEntityInput = {
    where: BusinessUnitWhereUniqueInput
    update: XOR<BusinessUnitUpdateWithoutLegalEntityInput, BusinessUnitUncheckedUpdateWithoutLegalEntityInput>
    create: XOR<BusinessUnitCreateWithoutLegalEntityInput, BusinessUnitUncheckedCreateWithoutLegalEntityInput>
  }

  export type BusinessUnitUpdateWithWhereUniqueWithoutLegalEntityInput = {
    where: BusinessUnitWhereUniqueInput
    data: XOR<BusinessUnitUpdateWithoutLegalEntityInput, BusinessUnitUncheckedUpdateWithoutLegalEntityInput>
  }

  export type BusinessUnitUpdateManyWithWhereWithoutLegalEntityInput = {
    where: BusinessUnitScalarWhereInput
    data: XOR<BusinessUnitUpdateManyMutationInput, BusinessUnitUncheckedUpdateManyWithoutLegalEntityInput>
  }

  export type TenantCreateWithoutBusinessUnitsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutBusinessUnitsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutBusinessUnitsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutBusinessUnitsInput, TenantUncheckedCreateWithoutBusinessUnitsInput>
  }

  export type LegalEntityCreateWithoutBusinessUnitsInput = {
    id?: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutLegalEntitiesInput
  }

  export type LegalEntityUncheckedCreateWithoutBusinessUnitsInput = {
    id?: string
    tenantId: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LegalEntityCreateOrConnectWithoutBusinessUnitsInput = {
    where: LegalEntityWhereUniqueInput
    create: XOR<LegalEntityCreateWithoutBusinessUnitsInput, LegalEntityUncheckedCreateWithoutBusinessUnitsInput>
  }

  export type BusinessUnitCreateWithoutChildrenInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutChildrenInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutChildrenInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutChildrenInput, BusinessUnitUncheckedCreateWithoutChildrenInput>
  }

  export type BusinessUnitCreateWithoutParentInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutParentInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutParentInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput>
  }

  export type BusinessUnitCreateManyParentInputEnvelope = {
    data: BusinessUnitCreateManyParentInput | BusinessUnitCreateManyParentInput[]
    skipDuplicates?: boolean
  }

  export type BranchCreateWithoutBusinessUnitInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBranchesInput
  }

  export type BranchUncheckedCreateWithoutBusinessUnitInput = {
    id?: string
    tenantId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchCreateOrConnectWithoutBusinessUnitInput = {
    where: BranchWhereUniqueInput
    create: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput>
  }

  export type BranchCreateManyBusinessUnitInputEnvelope = {
    data: BranchCreateManyBusinessUnitInput | BranchCreateManyBusinessUnitInput[]
    skipDuplicates?: boolean
  }

  export type FactoryCreateWithoutBusinessUnitInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutFactoriesInput
  }

  export type FactoryUncheckedCreateWithoutBusinessUnitInput = {
    id?: string
    tenantId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryCreateOrConnectWithoutBusinessUnitInput = {
    where: FactoryWhereUniqueInput
    create: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput>
  }

  export type FactoryCreateManyBusinessUnitInputEnvelope = {
    data: FactoryCreateManyBusinessUnitInput | FactoryCreateManyBusinessUnitInput[]
    skipDuplicates?: boolean
  }

  export type TenantUpsertWithoutBusinessUnitsInput = {
    update: XOR<TenantUpdateWithoutBusinessUnitsInput, TenantUncheckedUpdateWithoutBusinessUnitsInput>
    create: XOR<TenantCreateWithoutBusinessUnitsInput, TenantUncheckedCreateWithoutBusinessUnitsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutBusinessUnitsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutBusinessUnitsInput, TenantUncheckedUpdateWithoutBusinessUnitsInput>
  }

  export type TenantUpdateWithoutBusinessUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutBusinessUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type LegalEntityUpsertWithoutBusinessUnitsInput = {
    update: XOR<LegalEntityUpdateWithoutBusinessUnitsInput, LegalEntityUncheckedUpdateWithoutBusinessUnitsInput>
    create: XOR<LegalEntityCreateWithoutBusinessUnitsInput, LegalEntityUncheckedCreateWithoutBusinessUnitsInput>
    where?: LegalEntityWhereInput
  }

  export type LegalEntityUpdateToOneWithWhereWithoutBusinessUnitsInput = {
    where?: LegalEntityWhereInput
    data: XOR<LegalEntityUpdateWithoutBusinessUnitsInput, LegalEntityUncheckedUpdateWithoutBusinessUnitsInput>
  }

  export type LegalEntityUpdateWithoutBusinessUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutLegalEntitiesNestedInput
  }

  export type LegalEntityUncheckedUpdateWithoutBusinessUnitsInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BusinessUnitUpsertWithoutChildrenInput = {
    update: XOR<BusinessUnitUpdateWithoutChildrenInput, BusinessUnitUncheckedUpdateWithoutChildrenInput>
    create: XOR<BusinessUnitCreateWithoutChildrenInput, BusinessUnitUncheckedCreateWithoutChildrenInput>
    where?: BusinessUnitWhereInput
  }

  export type BusinessUnitUpdateToOneWithWhereWithoutChildrenInput = {
    where?: BusinessUnitWhereInput
    data: XOR<BusinessUnitUpdateWithoutChildrenInput, BusinessUnitUncheckedUpdateWithoutChildrenInput>
  }

  export type BusinessUnitUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUpsertWithWhereUniqueWithoutParentInput = {
    where: BusinessUnitWhereUniqueInput
    update: XOR<BusinessUnitUpdateWithoutParentInput, BusinessUnitUncheckedUpdateWithoutParentInput>
    create: XOR<BusinessUnitCreateWithoutParentInput, BusinessUnitUncheckedCreateWithoutParentInput>
  }

  export type BusinessUnitUpdateWithWhereUniqueWithoutParentInput = {
    where: BusinessUnitWhereUniqueInput
    data: XOR<BusinessUnitUpdateWithoutParentInput, BusinessUnitUncheckedUpdateWithoutParentInput>
  }

  export type BusinessUnitUpdateManyWithWhereWithoutParentInput = {
    where: BusinessUnitScalarWhereInput
    data: XOR<BusinessUnitUpdateManyMutationInput, BusinessUnitUncheckedUpdateManyWithoutParentInput>
  }

  export type BranchUpsertWithWhereUniqueWithoutBusinessUnitInput = {
    where: BranchWhereUniqueInput
    update: XOR<BranchUpdateWithoutBusinessUnitInput, BranchUncheckedUpdateWithoutBusinessUnitInput>
    create: XOR<BranchCreateWithoutBusinessUnitInput, BranchUncheckedCreateWithoutBusinessUnitInput>
  }

  export type BranchUpdateWithWhereUniqueWithoutBusinessUnitInput = {
    where: BranchWhereUniqueInput
    data: XOR<BranchUpdateWithoutBusinessUnitInput, BranchUncheckedUpdateWithoutBusinessUnitInput>
  }

  export type BranchUpdateManyWithWhereWithoutBusinessUnitInput = {
    where: BranchScalarWhereInput
    data: XOR<BranchUpdateManyMutationInput, BranchUncheckedUpdateManyWithoutBusinessUnitInput>
  }

  export type FactoryUpsertWithWhereUniqueWithoutBusinessUnitInput = {
    where: FactoryWhereUniqueInput
    update: XOR<FactoryUpdateWithoutBusinessUnitInput, FactoryUncheckedUpdateWithoutBusinessUnitInput>
    create: XOR<FactoryCreateWithoutBusinessUnitInput, FactoryUncheckedCreateWithoutBusinessUnitInput>
  }

  export type FactoryUpdateWithWhereUniqueWithoutBusinessUnitInput = {
    where: FactoryWhereUniqueInput
    data: XOR<FactoryUpdateWithoutBusinessUnitInput, FactoryUncheckedUpdateWithoutBusinessUnitInput>
  }

  export type FactoryUpdateManyWithWhereWithoutBusinessUnitInput = {
    where: FactoryScalarWhereInput
    data: XOR<FactoryUpdateManyMutationInput, FactoryUncheckedUpdateManyWithoutBusinessUnitInput>
  }

  export type TenantCreateWithoutBranchesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutBranchesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutBranchesInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutBranchesInput, TenantUncheckedCreateWithoutBranchesInput>
  }

  export type BusinessUnitCreateWithoutBranchesInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    factories?: FactoryCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutBranchesInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    factories?: FactoryUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutBranchesInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutBranchesInput, BusinessUnitUncheckedCreateWithoutBranchesInput>
  }

  export type TenantUpsertWithoutBranchesInput = {
    update: XOR<TenantUpdateWithoutBranchesInput, TenantUncheckedUpdateWithoutBranchesInput>
    create: XOR<TenantCreateWithoutBranchesInput, TenantUncheckedCreateWithoutBranchesInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutBranchesInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutBranchesInput, TenantUncheckedUpdateWithoutBranchesInput>
  }

  export type TenantUpdateWithoutBranchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutBranchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type BusinessUnitUpsertWithoutBranchesInput = {
    update: XOR<BusinessUnitUpdateWithoutBranchesInput, BusinessUnitUncheckedUpdateWithoutBranchesInput>
    create: XOR<BusinessUnitCreateWithoutBranchesInput, BusinessUnitUncheckedCreateWithoutBranchesInput>
    where?: BusinessUnitWhereInput
  }

  export type BusinessUnitUpdateToOneWithWhereWithoutBranchesInput = {
    where?: BusinessUnitWhereInput
    data: XOR<BusinessUnitUpdateWithoutBranchesInput, BusinessUnitUncheckedUpdateWithoutBranchesInput>
  }

  export type BusinessUnitUpdateWithoutBranchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutBranchesInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type TenantCreateWithoutFactoriesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutFactoriesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutFactoriesInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutFactoriesInput, TenantUncheckedCreateWithoutFactoriesInput>
  }

  export type BusinessUnitCreateWithoutFactoriesInput = {
    id?: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutBusinessUnitsInput
    legalEntity: LegalEntityCreateNestedOneWithoutBusinessUnitsInput
    parent?: BusinessUnitCreateNestedOneWithoutChildrenInput
    children?: BusinessUnitCreateNestedManyWithoutParentInput
    branches?: BranchCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitUncheckedCreateWithoutFactoriesInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    children?: BusinessUnitUncheckedCreateNestedManyWithoutParentInput
    branches?: BranchUncheckedCreateNestedManyWithoutBusinessUnitInput
  }

  export type BusinessUnitCreateOrConnectWithoutFactoriesInput = {
    where: BusinessUnitWhereUniqueInput
    create: XOR<BusinessUnitCreateWithoutFactoriesInput, BusinessUnitUncheckedCreateWithoutFactoriesInput>
  }

  export type TenantUpsertWithoutFactoriesInput = {
    update: XOR<TenantUpdateWithoutFactoriesInput, TenantUncheckedUpdateWithoutFactoriesInput>
    create: XOR<TenantCreateWithoutFactoriesInput, TenantUncheckedCreateWithoutFactoriesInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutFactoriesInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutFactoriesInput, TenantUncheckedUpdateWithoutFactoriesInput>
  }

  export type TenantUpdateWithoutFactoriesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutFactoriesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type BusinessUnitUpsertWithoutFactoriesInput = {
    update: XOR<BusinessUnitUpdateWithoutFactoriesInput, BusinessUnitUncheckedUpdateWithoutFactoriesInput>
    create: XOR<BusinessUnitCreateWithoutFactoriesInput, BusinessUnitUncheckedCreateWithoutFactoriesInput>
    where?: BusinessUnitWhereInput
  }

  export type BusinessUnitUpdateToOneWithWhereWithoutFactoriesInput = {
    where?: BusinessUnitWhereInput
    data: XOR<BusinessUnitUpdateWithoutFactoriesInput, BusinessUnitUncheckedUpdateWithoutFactoriesInput>
  }

  export type BusinessUnitUpdateWithoutFactoriesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutFactoriesInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type TenantCreateWithoutUsersInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutUsersInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutUsersInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
  }

  export type UserRoleAssignmentCreateWithoutUserInput = {
    id?: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRoleAssignmentsInput
    role: RoleCreateNestedOneWithoutAssignmentsInput
  }

  export type UserRoleAssignmentUncheckedCreateWithoutUserInput = {
    id?: string
    tenantId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentCreateOrConnectWithoutUserInput = {
    where: UserRoleAssignmentWhereUniqueInput
    create: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput>
  }

  export type UserRoleAssignmentCreateManyUserInputEnvelope = {
    data: UserRoleAssignmentCreateManyUserInput | UserRoleAssignmentCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type TenantUpsertWithoutUsersInput = {
    update: XOR<TenantUpdateWithoutUsersInput, TenantUncheckedUpdateWithoutUsersInput>
    create: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutUsersInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutUsersInput, TenantUncheckedUpdateWithoutUsersInput>
  }

  export type TenantUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type UserRoleAssignmentUpsertWithWhereUniqueWithoutUserInput = {
    where: UserRoleAssignmentWhereUniqueInput
    update: XOR<UserRoleAssignmentUpdateWithoutUserInput, UserRoleAssignmentUncheckedUpdateWithoutUserInput>
    create: XOR<UserRoleAssignmentCreateWithoutUserInput, UserRoleAssignmentUncheckedCreateWithoutUserInput>
  }

  export type UserRoleAssignmentUpdateWithWhereUniqueWithoutUserInput = {
    where: UserRoleAssignmentWhereUniqueInput
    data: XOR<UserRoleAssignmentUpdateWithoutUserInput, UserRoleAssignmentUncheckedUpdateWithoutUserInput>
  }

  export type UserRoleAssignmentUpdateManyWithWhereWithoutUserInput = {
    where: UserRoleAssignmentScalarWhereInput
    data: XOR<UserRoleAssignmentUpdateManyMutationInput, UserRoleAssignmentUncheckedUpdateManyWithoutUserInput>
  }

  export type TenantCreateWithoutRolesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutRolesInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutRolesInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutRolesInput, TenantUncheckedCreateWithoutRolesInput>
  }

  export type RolePermissionCreateWithoutRoleInput = {
    id?: string
    tenantId: string
    permissionKey: string
  }

  export type RolePermissionUncheckedCreateWithoutRoleInput = {
    id?: string
    tenantId: string
    permissionKey: string
  }

  export type RolePermissionCreateOrConnectWithoutRoleInput = {
    where: RolePermissionWhereUniqueInput
    create: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput>
  }

  export type RolePermissionCreateManyRoleInputEnvelope = {
    data: RolePermissionCreateManyRoleInput | RolePermissionCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type UserRoleAssignmentCreateWithoutRoleInput = {
    id?: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRoleAssignmentsInput
    user: UserCreateNestedOneWithoutRoleAssignmentsInput
  }

  export type UserRoleAssignmentUncheckedCreateWithoutRoleInput = {
    id?: string
    tenantId: string
    userId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentCreateOrConnectWithoutRoleInput = {
    where: UserRoleAssignmentWhereUniqueInput
    create: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput>
  }

  export type UserRoleAssignmentCreateManyRoleInputEnvelope = {
    data: UserRoleAssignmentCreateManyRoleInput | UserRoleAssignmentCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type TenantUpsertWithoutRolesInput = {
    update: XOR<TenantUpdateWithoutRolesInput, TenantUncheckedUpdateWithoutRolesInput>
    create: XOR<TenantCreateWithoutRolesInput, TenantUncheckedCreateWithoutRolesInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutRolesInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutRolesInput, TenantUncheckedUpdateWithoutRolesInput>
  }

  export type TenantUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutRolesInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type RolePermissionUpsertWithWhereUniqueWithoutRoleInput = {
    where: RolePermissionWhereUniqueInput
    update: XOR<RolePermissionUpdateWithoutRoleInput, RolePermissionUncheckedUpdateWithoutRoleInput>
    create: XOR<RolePermissionCreateWithoutRoleInput, RolePermissionUncheckedCreateWithoutRoleInput>
  }

  export type RolePermissionUpdateWithWhereUniqueWithoutRoleInput = {
    where: RolePermissionWhereUniqueInput
    data: XOR<RolePermissionUpdateWithoutRoleInput, RolePermissionUncheckedUpdateWithoutRoleInput>
  }

  export type RolePermissionUpdateManyWithWhereWithoutRoleInput = {
    where: RolePermissionScalarWhereInput
    data: XOR<RolePermissionUpdateManyMutationInput, RolePermissionUncheckedUpdateManyWithoutRoleInput>
  }

  export type RolePermissionScalarWhereInput = {
    AND?: RolePermissionScalarWhereInput | RolePermissionScalarWhereInput[]
    OR?: RolePermissionScalarWhereInput[]
    NOT?: RolePermissionScalarWhereInput | RolePermissionScalarWhereInput[]
    id?: UuidFilter<"RolePermission"> | string
    tenantId?: UuidFilter<"RolePermission"> | string
    roleId?: UuidFilter<"RolePermission"> | string
    permissionKey?: StringFilter<"RolePermission"> | string
  }

  export type UserRoleAssignmentUpsertWithWhereUniqueWithoutRoleInput = {
    where: UserRoleAssignmentWhereUniqueInput
    update: XOR<UserRoleAssignmentUpdateWithoutRoleInput, UserRoleAssignmentUncheckedUpdateWithoutRoleInput>
    create: XOR<UserRoleAssignmentCreateWithoutRoleInput, UserRoleAssignmentUncheckedCreateWithoutRoleInput>
  }

  export type UserRoleAssignmentUpdateWithWhereUniqueWithoutRoleInput = {
    where: UserRoleAssignmentWhereUniqueInput
    data: XOR<UserRoleAssignmentUpdateWithoutRoleInput, UserRoleAssignmentUncheckedUpdateWithoutRoleInput>
  }

  export type UserRoleAssignmentUpdateManyWithWhereWithoutRoleInput = {
    where: UserRoleAssignmentScalarWhereInput
    data: XOR<UserRoleAssignmentUpdateManyMutationInput, UserRoleAssignmentUncheckedUpdateManyWithoutRoleInput>
  }

  export type RoleCreateWithoutPermissionsInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRolesInput
    assignments?: UserRoleAssignmentCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutPermissionsInput = {
    id?: string
    tenantId: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    assignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutPermissionsInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutPermissionsInput, RoleUncheckedCreateWithoutPermissionsInput>
  }

  export type RoleUpsertWithoutPermissionsInput = {
    update: XOR<RoleUpdateWithoutPermissionsInput, RoleUncheckedUpdateWithoutPermissionsInput>
    create: XOR<RoleCreateWithoutPermissionsInput, RoleUncheckedCreateWithoutPermissionsInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutPermissionsInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutPermissionsInput, RoleUncheckedUpdateWithoutPermissionsInput>
  }

  export type RoleUpdateWithoutPermissionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRolesNestedInput
    assignments?: UserRoleAssignmentUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutPermissionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    assignments?: UserRoleAssignmentUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type TenantCreateWithoutRoleAssignmentsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutRoleAssignmentsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutRoleAssignmentsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutRoleAssignmentsInput, TenantUncheckedCreateWithoutRoleAssignmentsInput>
  }

  export type UserCreateWithoutRoleAssignmentsInput = {
    id?: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutUsersInput
  }

  export type UserUncheckedCreateWithoutRoleAssignmentsInput = {
    id?: string
    tenantId: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserCreateOrConnectWithoutRoleAssignmentsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutRoleAssignmentsInput, UserUncheckedCreateWithoutRoleAssignmentsInput>
  }

  export type RoleCreateWithoutAssignmentsInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutRolesInput
    permissions?: RolePermissionCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutAssignmentsInput = {
    id?: string
    tenantId: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    permissions?: RolePermissionUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutAssignmentsInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutAssignmentsInput, RoleUncheckedCreateWithoutAssignmentsInput>
  }

  export type TenantUpsertWithoutRoleAssignmentsInput = {
    update: XOR<TenantUpdateWithoutRoleAssignmentsInput, TenantUncheckedUpdateWithoutRoleAssignmentsInput>
    create: XOR<TenantCreateWithoutRoleAssignmentsInput, TenantUncheckedCreateWithoutRoleAssignmentsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutRoleAssignmentsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutRoleAssignmentsInput, TenantUncheckedUpdateWithoutRoleAssignmentsInput>
  }

  export type TenantUpdateWithoutRoleAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutRoleAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type UserUpsertWithoutRoleAssignmentsInput = {
    update: XOR<UserUpdateWithoutRoleAssignmentsInput, UserUncheckedUpdateWithoutRoleAssignmentsInput>
    create: XOR<UserCreateWithoutRoleAssignmentsInput, UserUncheckedCreateWithoutRoleAssignmentsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutRoleAssignmentsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutRoleAssignmentsInput, UserUncheckedUpdateWithoutRoleAssignmentsInput>
  }

  export type UserUpdateWithoutRoleAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutUsersNestedInput
  }

  export type UserUncheckedUpdateWithoutRoleAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUpsertWithoutAssignmentsInput = {
    update: XOR<RoleUpdateWithoutAssignmentsInput, RoleUncheckedUpdateWithoutAssignmentsInput>
    create: XOR<RoleCreateWithoutAssignmentsInput, RoleUncheckedCreateWithoutAssignmentsInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutAssignmentsInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutAssignmentsInput, RoleUncheckedUpdateWithoutAssignmentsInput>
  }

  export type RoleUpdateWithoutAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRolesNestedInput
    permissions?: RolePermissionUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutAssignmentsInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    permissions?: RolePermissionUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type TenantCreateWithoutAuditEventsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutAuditEventsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    outboxEvents?: OutboxEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutAuditEventsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutAuditEventsInput, TenantUncheckedCreateWithoutAuditEventsInput>
  }

  export type TenantUpsertWithoutAuditEventsInput = {
    update: XOR<TenantUpdateWithoutAuditEventsInput, TenantUncheckedUpdateWithoutAuditEventsInput>
    create: XOR<TenantCreateWithoutAuditEventsInput, TenantUncheckedCreateWithoutAuditEventsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutAuditEventsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutAuditEventsInput, TenantUncheckedUpdateWithoutAuditEventsInput>
  }

  export type TenantUpdateWithoutAuditEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutAuditEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    outboxEvents?: OutboxEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantCreateWithoutOutboxEventsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitCreateNestedManyWithoutTenantInput
    branches?: BranchCreateNestedManyWithoutTenantInput
    factories?: FactoryCreateNestedManyWithoutTenantInput
    users?: UserCreateNestedManyWithoutTenantInput
    roles?: RoleCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutOutboxEventsInput = {
    id?: string
    slug: string
    name: string
    status?: $Enums.TenantStatus
    version?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedCreateNestedManyWithoutTenantInput
    legalEntities?: LegalEntityUncheckedCreateNestedManyWithoutTenantInput
    businessUnits?: BusinessUnitUncheckedCreateNestedManyWithoutTenantInput
    branches?: BranchUncheckedCreateNestedManyWithoutTenantInput
    factories?: FactoryUncheckedCreateNestedManyWithoutTenantInput
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    roles?: RoleUncheckedCreateNestedManyWithoutTenantInput
    roleAssignments?: UserRoleAssignmentUncheckedCreateNestedManyWithoutTenantInput
    auditEvents?: AuditEventUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutOutboxEventsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutOutboxEventsInput, TenantUncheckedCreateWithoutOutboxEventsInput>
  }

  export type TenantUpsertWithoutOutboxEventsInput = {
    update: XOR<TenantUpdateWithoutOutboxEventsInput, TenantUncheckedUpdateWithoutOutboxEventsInput>
    create: XOR<TenantCreateWithoutOutboxEventsInput, TenantUncheckedCreateWithoutOutboxEventsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutOutboxEventsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutOutboxEventsInput, TenantUncheckedUpdateWithoutOutboxEventsInput>
  }

  export type TenantUpdateWithoutOutboxEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUpdateManyWithoutTenantNestedInput
    branches?: BranchUpdateManyWithoutTenantNestedInput
    factories?: FactoryUpdateManyWithoutTenantNestedInput
    users?: UserUpdateManyWithoutTenantNestedInput
    roles?: RoleUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutOutboxEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: EnumTenantStatusFieldUpdateOperationsInput | $Enums.TenantStatus
    version?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    configurationVersions?: TenantConfigurationVersionUncheckedUpdateManyWithoutTenantNestedInput
    legalEntities?: LegalEntityUncheckedUpdateManyWithoutTenantNestedInput
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutTenantNestedInput
    branches?: BranchUncheckedUpdateManyWithoutTenantNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutTenantNestedInput
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    roles?: RoleUncheckedUpdateManyWithoutTenantNestedInput
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutTenantNestedInput
    auditEvents?: AuditEventUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantConfigurationVersionCreateManyTenantInput = {
    id?: string
    version: number
    config: JsonNullValueInput | InputJsonValue
    publishedAt?: Date | string
    publishedBy?: string | null
  }

  export type LegalEntityCreateManyTenantInput = {
    id?: string
    name: string
    code?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BusinessUnitCreateManyTenantInput = {
    id?: string
    legalEntityId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchCreateManyTenantInput = {
    id?: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryCreateManyTenantInput = {
    id?: string
    businessUnitId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserCreateManyTenantInput = {
    id?: string
    email: string
    displayName: string
    status?: $Enums.UserStatus
    idpSubject?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RoleCreateManyTenantInput = {
    id?: string
    name: string
    description?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserRoleAssignmentCreateManyTenantInput = {
    id?: string
    userId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type AuditEventCreateManyTenantInput = {
    id?: string
    actorType: $Enums.ActorType
    actorId?: string | null
    action: string
    objectType: string
    objectId: string
    occurredAt?: Date | string
    correlationId: string
    source: string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: string | null
  }

  export type OutboxEventCreateManyTenantInput = {
    id?: string
    eventType: string
    eventVersion?: number
    aggregateType: string
    aggregateId: string
    occurredAt?: Date | string
    actorType: $Enums.ActorType
    actorId?: string | null
    correlationId: string
    causationId?: string | null
    payload: JsonNullValueInput | InputJsonValue
    status?: $Enums.OutboxStatus
    attempts?: number
    dispatchedAt?: Date | string | null
    lastError?: string | null
  }

  export type TenantConfigurationVersionUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TenantConfigurationVersionUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TenantConfigurationVersionUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    version?: IntFieldUpdateOperationsInput | number
    config?: JsonNullValueInput | InputJsonValue
    publishedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    publishedBy?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type LegalEntityUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    businessUnits?: BusinessUnitUpdateManyWithoutLegalEntityNestedInput
  }

  export type LegalEntityUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    businessUnits?: BusinessUnitUncheckedUpdateManyWithoutLegalEntityNestedInput
  }

  export type LegalEntityUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    code?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BusinessUnitUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    businessUnit?: BusinessUnitUpdateOneRequiredWithoutBranchesNestedInput
  }

  export type BranchUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    businessUnit?: BusinessUnitUpdateOneRequiredWithoutFactoriesNestedInput
  }

  export type FactoryUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    businessUnitId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roleAssignments?: UserRoleAssignmentUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roleAssignments?: UserRoleAssignmentUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    status?: EnumUserStatusFieldUpdateOperationsInput | $Enums.UserStatus
    idpSubject?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    permissions?: RolePermissionUpdateManyWithoutRoleNestedInput
    assignments?: UserRoleAssignmentUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    permissions?: RolePermissionUncheckedUpdateManyWithoutRoleNestedInput
    assignments?: UserRoleAssignmentUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutRoleAssignmentsNestedInput
    role?: RoleUpdateOneRequiredWithoutAssignmentsNestedInput
  }

  export type UserRoleAssignmentUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type AuditEventUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AuditEventUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type AuditEventUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    action?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    objectId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    correlationId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    previousValues?: NullableJsonNullValueInput | InputJsonValue
    newValues?: NullableJsonNullValueInput | InputJsonValue
    reason?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type OutboxEventUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    eventType?: StringFieldUpdateOperationsInput | string
    eventVersion?: IntFieldUpdateOperationsInput | number
    aggregateType?: StringFieldUpdateOperationsInput | string
    aggregateId?: StringFieldUpdateOperationsInput | string
    occurredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    actorType?: EnumActorTypeFieldUpdateOperationsInput | $Enums.ActorType
    actorId?: NullableStringFieldUpdateOperationsInput | string | null
    correlationId?: StringFieldUpdateOperationsInput | string
    causationId?: NullableStringFieldUpdateOperationsInput | string | null
    payload?: JsonNullValueInput | InputJsonValue
    status?: EnumOutboxStatusFieldUpdateOperationsInput | $Enums.OutboxStatus
    attempts?: IntFieldUpdateOperationsInput | number
    dispatchedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type BusinessUnitCreateManyLegalEntityInput = {
    id?: string
    tenantId: string
    parentId?: string | null
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BusinessUnitUpdateWithoutLegalEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    parent?: BusinessUnitUpdateOneWithoutChildrenNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutLegalEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateManyWithoutLegalEntityInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    parentId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BusinessUnitCreateManyParentInput = {
    id?: string
    tenantId: string
    legalEntityId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BranchCreateManyBusinessUnitInput = {
    id?: string
    tenantId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FactoryCreateManyBusinessUnitInput = {
    id?: string
    tenantId: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BusinessUnitUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBusinessUnitsNestedInput
    legalEntity?: LegalEntityUpdateOneRequiredWithoutBusinessUnitsNestedInput
    children?: BusinessUnitUpdateManyWithoutParentNestedInput
    branches?: BranchUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    children?: BusinessUnitUncheckedUpdateManyWithoutParentNestedInput
    branches?: BranchUncheckedUpdateManyWithoutBusinessUnitNestedInput
    factories?: FactoryUncheckedUpdateManyWithoutBusinessUnitNestedInput
  }

  export type BusinessUnitUncheckedUpdateManyWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    legalEntityId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchUpdateWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutBranchesNestedInput
  }

  export type BranchUncheckedUpdateWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BranchUncheckedUpdateManyWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryUpdateWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutFactoriesNestedInput
  }

  export type FactoryUncheckedUpdateWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FactoryUncheckedUpdateManyWithoutBusinessUnitInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentCreateManyUserInput = {
    id?: string
    tenantId: string
    roleId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type UserRoleAssignmentUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRoleAssignmentsNestedInput
    role?: RoleUpdateOneRequiredWithoutAssignmentsNestedInput
  }

  export type UserRoleAssignmentUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    roleId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RolePermissionCreateManyRoleInput = {
    id?: string
    tenantId: string
    permissionKey: string
  }

  export type UserRoleAssignmentCreateManyRoleInput = {
    id?: string
    tenantId: string
    userId: string
    scopeType?: $Enums.ScopeType
    scopeId: string
    createdAt?: Date | string
  }

  export type RolePermissionUpdateWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type RolePermissionUncheckedUpdateWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type RolePermissionUncheckedUpdateManyWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    permissionKey?: StringFieldUpdateOperationsInput | string
  }

  export type UserRoleAssignmentUpdateWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutRoleAssignmentsNestedInput
    user?: UserUpdateOneRequiredWithoutRoleAssignmentsNestedInput
  }

  export type UserRoleAssignmentUncheckedUpdateWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserRoleAssignmentUncheckedUpdateManyWithoutRoleInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    scopeType?: EnumScopeTypeFieldUpdateOperationsInput | $Enums.ScopeType
    scopeId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}