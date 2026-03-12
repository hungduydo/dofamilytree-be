export declare class CreateRelationshipDto {
    parentId: string;
    childId: string;
    type: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE';
    note?: string;
}
export declare class SearchRelationshipDto {
    memberId?: string;
    type?: 'BIOLOGICAL' | 'ADOPTED' | 'SPOUSE';
    role?: 'parent' | 'child' | 'spouse';
}
