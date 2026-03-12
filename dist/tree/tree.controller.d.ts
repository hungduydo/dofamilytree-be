import { TreeService } from './tree.service';
declare class CreateTreeDto {
    title?: string;
    description?: string;
    image?: string;
    owner_id: string;
    show?: boolean;
}
declare class UpdateTreeDto {
    title?: string;
    description?: string;
    image?: string;
    show?: boolean;
}
export declare class TreeController {
    private readonly treeService;
    constructor(treeService: TreeService);
    getChart(): Promise<{
        nodes: import("./tree.service").FamilyChartNode[];
        generatedAt: string;
    }>;
    getSubTreeChart(memberId: string): Promise<{
        nodes: import("./tree.service").FamilyChartNode[];
        generatedAt: string;
    }>;
    regenerate(): Promise<{
        nodes: import("./tree.service").FamilyChartNode[];
        generatedAt: string;
    }>;
    getStats(): Promise<{
        totalMembers: number;
        totalGenerations: number;
        deceased: number;
        cacheStatus: string;
        generatedAt: string;
    }>;
    getHomeTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }[]>;
    getAllTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }[]>;
    getTreeById(id: string): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }>;
    createTree(dto: CreateTreeDto): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }>;
    updateTree(id: string, dto: UpdateTreeDto): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }>;
    deleteTree(id: string): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }>;
}
export {};
