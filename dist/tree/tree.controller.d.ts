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
    getStats(): Promise<any>;
    getHomeTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }[]>;
    getAllTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }[]>;
    getTreeById(id: string): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }>;
    createTree(dto: CreateTreeDto): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }>;
    updateTree(id: string, dto: UpdateTreeDto): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }>;
    deleteTree(id: string): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }>;
}
export {};
