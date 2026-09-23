import { Client } from 'ldapts';

export interface LdapUser {
  email: string;
  name: string;
  groups: string[];
}

export function mapLdapGroupsToRole(groups: string[]): string {
  const groupsLower = groups.map(g => g.toLowerCase());
  
  if (groupsLower.some(g => g.includes('domain admins') || g.includes('forge_admins'))) {
    return 'admin';
  }
  if (groupsLower.some(g => g.includes('pipeline tds') || g.includes('production_head'))) {
    return 'production_head';
  }
  if (groupsLower.some(g => g.includes('producers'))) {
    return 'producer';
  }
  if (groupsLower.some(g => g.includes('leads') || g.includes('supervisors'))) {
    return 'lead';
  }
  return 'artist'; // Default
}

function escapeLdapFilter(input: string): string {
  return input.replace(/\\/g, '\\5c')
              .replace(/\*/g, '\\2a')
              .replace(/\(/g, '\\28')
              .replace(/\)/g, '\\29')
              .replace(/\0/g, '\\00');
}

export async function ldapLogin(username: string, password: string): Promise<LdapUser | null> {
  const url = process.env.LDAP_URL;
  const bindDN = process.env.LDAP_BIND_DN;
  const bindPassword = process.env.LDAP_BIND_PASSWORD;
  const baseDN = process.env.LDAP_BASE_DN;

  if (!url || !bindDN || !bindPassword || !baseDN) {
    throw new Error('LDAP configuration is missing required environment variables.');
  }

  const client = new Client({
    url,
    timeout: 5000,
    connectTimeout: 5000,
  });

  try {
    // 1. Bind with service account
    await client.bind(bindDN, bindPassword);

    // 2. Search for the user
    const safeUsername = escapeLdapFilter(username);
    const searchFilter = safeUsername.includes('@') 
        ? `(mail=${safeUsername})` 
        : `(sAMAccountName=${safeUsername})`;

    const { searchEntries } = await client.search(baseDN, {
      filter: searchFilter,
      scope: 'sub',
      attributes: ['dn', 'mail', 'displayName', 'cn', 'memberOf'],
    });

    if (searchEntries.length === 0) {
      return null;
    }

    const userEntry = searchEntries[0];
    const userDN = userEntry.dn;

    // 3. Verify user password by binding as them
    await client.bind(userDN, password);

    // 4. Extract info
    const email = (userEntry.mail as string) || `${username}@entertainment.net`;
    const name = (userEntry.displayName as string) || (userEntry.cn as string) || username;
    
    let groups: string[] = [];
    if (userEntry.memberOf) {
      if (Array.isArray(userEntry.memberOf)) {
        groups = userEntry.memberOf.map((g: string | Buffer) => g.toString());
      } else {
        groups = [userEntry.memberOf.toString()];
      }
    }

    return {
      email,
      name,
      groups
    };
  } catch (error: any) {
    if (error?.name === 'InvalidCredentialsError' || error?.message?.includes('InvalidCredentials')) {
      console.warn('LDAP invalid credentials:', username);
      return null;
    }
    console.error('LDAP infrastructure error:', error);
    throw error;
  } finally {
    try {
      await client.unbind();
    } catch (e) {
      // Ignore unbind errors
    }
  }
}
