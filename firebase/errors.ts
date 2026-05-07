export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  public source: string = 'firestore-permission-error';

  constructor(public context: SecurityRuleContext) {
    const message = `
FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:
${JSON.stringify({
  securityRuleContext: context,
}, null, 2)}
`;
    super(message);
    this.name = 'FirestorePermissionError';
  }
}
