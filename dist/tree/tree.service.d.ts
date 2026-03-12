import { PrismaService } from '../prisma/prisma.service';
import type { Redis } from 'ioredis';
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
    constructor(prisma: PrismaService, redis: Redis);
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
    getStats(): Promise<{
        totalMembers: number;
        totalGenerations: number;
        deceased: number;
        cacheStatus: string;
        generatedAt: string;
    }>;
    getAllTrees(): Promise<{
        description: string | null;
        title: string | null;
        id: string;
        created_at: Date;
        image: string | null;
        owner_id: string;
        show: boolean;
    }[]>;
    getHomeTrees(): Promise<{
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
        image: string | null;
        owner_id: string;
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
    private memberToNode;
}
