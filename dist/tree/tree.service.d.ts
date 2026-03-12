import { PrismaService } from '../prisma/prisma.service';
import { Redis as UpstashRedis } from '@upstash/redis';
export interface FamilyChartNode {
    id: string;
    rels: {
        spouses?: string[];
        father?: string;
        mother?: string;
        children?: string[];
    };
    data: {
        gender: string;
        fn: string;
        ln: string;
        birthday?: string;
        avatar?: string;
        generation?: number;
        desc?: string;
    };
}
export declare class TreeService {
    private readonly prisma;
    private readonly redis;
    constructor(prisma: PrismaService, redis: UpstashRedis);
    getFamilyTreeChart(): Promise<{
        nodes: FamilyChartNode[];
        generatedAt: string;
    }>;
    regenerateFamilyTreeChart(): Promise<{
        nodes: FamilyChartNode[];
        generatedAt: string;
    }>;
    private buildAndCache;
    getFamilySubTreeChart(memberId: string): Promise<{
        nodes: FamilyChartNode[];
        generatedAt: string;
    }>;
    getStats(): Promise<any>;
    getAllTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }[]>;
    getHomeTrees(): Promise<{
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
    createTree(data: {
        title?: string;
        description?: string;
        image?: string;
        owner_id: string;
        show?: boolean;
    }): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        owner_id: string;
        image: string | null;
        show: boolean;
    }>;
    updateTree(id: string, data: Partial<{
        title: string;
        description: string;
        image: string;
        show: boolean;
    }>): Promise<{
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
    private memberToNode;
}
