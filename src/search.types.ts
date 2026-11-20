// A search query: free text plus npm's search qualifiers (at least one must be set)
export interface SearchQuery {
  text?: string;
  author?: string;
  maintainer?: string;
  // Without the `@` (`'angular'`); a leading `@` is removed
  scope?: string;
  keywords?: string | string[];
  not?: 'unstable' | 'insecure';
  is?: 'unstable' | 'insecure';
}

export interface SearchOptions {
  // Results per page, 1 to 250 (npm's default: 20)
  size?: number;
  // Offset of the first result
  from?: number;
}

// An npm user in search results
export interface SearchUser {
  username: string;
  email?: string;
}

export interface SearchPackageLinks {
  npm?: string;
  homepage?: string;
  repository?: string;
  bugs?: string;
}

export interface SearchPackage {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  license?: string;
  // Publish date of `version` (ISO string)
  date: string;
  links: SearchPackageLinks;
  publisher?: SearchUser;
  maintainers: SearchUser[];
}

export interface SearchScore {
  final: number;
  detail: {
    popularity: number;
    quality: number;
    maintenance: number;
  };
}

export interface SearchObject {
  package: SearchPackage;
  score: SearchScore;
  searchScore: number;
  downloads?: {
    weekly: number;
    monthly: number;
  };
  // Number of dependent packages (npm sends a string: converted to a number)
  dependents?: number;
  // Last update (ISO string)
  updated?: string;
  flags?: {
    insecure?: number;
  };
}

export interface SearchResult {
  objects: SearchObject[];
  total: number;
  // When the search ran (ISO string)
  time: string;
}
