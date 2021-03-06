/*
 * Copyright © 2019 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 *
 */
import { P2PPeerInfo } from '../p2p_types';
import { constructPeerIdFromPeerInfo, getBucketId, PEER_TYPE } from '../utils';

export interface PeerListConfig {
	readonly peerBucketCount: number;
	readonly peerBucketSize: number;
	readonly secret: number;
	readonly peerType: PEER_TYPE;
}
export interface CustomPeerInfo {
	readonly peerInfo: P2PPeerInfo;
	readonly dateAdded: Date;
}

export interface AddPeerOutcome {
	readonly success: boolean;
	readonly isAdded: boolean;
	readonly evictedPeer: P2PPeerInfo | undefined;
}
// Base peer list class is covering a basic peer list that has all the functionality to handle buckets with default eviction strategy
export class PeerList {
	protected peerMap: Map<number, Map<string, CustomPeerInfo>>;
	protected readonly peerListConfig: PeerListConfig;

	public constructor({
		peerBucketSize,
		peerBucketCount,
		secret,
		peerType,
	}: PeerListConfig) {
		this.peerListConfig = {
			peerBucketCount,
			peerBucketSize,
			peerType,
			secret,
		};
		this.peerMap = new Map();
		this.initializePeerList(this.peerMap);
	}

	public initializePeerList(
		peerMap: Map<number, Map<string, CustomPeerInfo>>,
	): void {
		// Initialize the Map with all the buckets
		for (const bucketId of [
			...new Array(this.peerListConfig.peerBucketCount).keys(),
		]) {
			peerMap.set(bucketId, new Map<string, CustomPeerInfo>());
		}
	}

	public peersList(): ReadonlyArray<P2PPeerInfo> {
		const peersListMap: P2PPeerInfo[] = [];

		for (const peerMap of [...this.peerMap.values()]) {
			for (const peer of [...peerMap.values()]) {
				peersListMap.push(peer.peerInfo);
			}
		}

		return peersListMap;
	}

	public selectBucketId(ipAddress: string): number {
		return getBucketId({
			secret: this.peerListConfig.secret,
			peerType: this.peerListConfig.peerType,
			targetAddress: ipAddress,
			bucketCount: this.peerListConfig.peerBucketCount,
		});
	}

	public updatePeer(peerInfo: P2PPeerInfo): boolean {
		const bucketId = this.selectBucketId(peerInfo.ipAddress);
		const bucket = this.peerMap.get(bucketId);

		if (!bucket) {
			return false;
		}
		const incomingPeerId = constructPeerIdFromPeerInfo(peerInfo);
		const foundPeer = bucket.get(incomingPeerId);

		if (!foundPeer) {
			return false;
		}
		const updatedPeerInfo: CustomPeerInfo = {
			...foundPeer,
			peerInfo: { ...foundPeer.peerInfo, ...peerInfo },
		};

		bucket.set(incomingPeerId, updatedPeerInfo);

		return true;
	}

	public removePeer(peerInfo: P2PPeerInfo): boolean {
		const bucketId = this.selectBucketId(peerInfo.ipAddress);
		const bucket = this.peerMap.get(bucketId);
		const incomingPeerId = constructPeerIdFromPeerInfo(peerInfo);

		if (bucket && bucket.get(incomingPeerId)) {
			const result = bucket.delete(incomingPeerId);

			return result;
		}

		return false;
	}

	public getPeer(peerInfo: P2PPeerInfo): P2PPeerInfo | undefined {
		const bucketId = this.selectBucketId(peerInfo.ipAddress);
		const bucket = this.peerMap.get(bucketId);
		const incomingPeerId = constructPeerIdFromPeerInfo(peerInfo);

		if (!bucket) {
			return undefined;
		}
		const peer = bucket.get(incomingPeerId);

		return peer ? peer.peerInfo : undefined;
	}

	public initPeerInfo = (peerInfo: P2PPeerInfo): CustomPeerInfo => ({
		peerInfo,
		dateAdded: new Date(),
	});

	// Addition of peer can also result in peer eviction if the bucket of the incoming peer is already full based on evection strategy.
	public addPeer(peerInfo: P2PPeerInfo): AddPeerOutcome {
		const bucketId = this.selectBucketId(peerInfo.ipAddress);
		const bucket = this.peerMap.get(bucketId);
		const incomingPeerId = constructPeerIdFromPeerInfo(peerInfo);

		if (!bucket) {
			return {
				success: false,
				isAdded: false,
				evictedPeer: undefined,
			};
		}

		if (bucket && bucket.get(incomingPeerId)) {
			return {
				success: false,
				isAdded: false,
				evictedPeer: undefined,
			};
		}

		const newPeer = this.initPeerInfo(peerInfo);

		if (bucket.size < this.peerListConfig.peerBucketSize) {
			bucket.set(incomingPeerId, newPeer);

			return {
				success: true,
				isAdded: true,
				evictedPeer: undefined,
			};
		}

		const evictedPeer = this.evictPeerFromBucket(bucketId);
		bucket.set(incomingPeerId, newPeer);

		return {
			success: !!evictedPeer,
			isAdded: true,
			evictedPeer: evictedPeer ? evictedPeer.peerInfo : undefined,
		};
	}

	// This action is called when a peer is disconnected
	public failedConnectionAction(incomingPeerInfo: P2PPeerInfo): boolean {
		const result = this.removePeer(incomingPeerInfo);

		return result;
	}

	protected evictPeerFromBucket(bucketId: number): CustomPeerInfo | undefined {
		return this.evictRandomlyFromBucket(bucketId);
	}
	// If there are no peers which are old enough to be evicted based on number of days then pick a peer randomly and evict.
	protected evictRandomlyFromBucket(
		bucketId: number,
	): CustomPeerInfo | undefined {
		const bucket = this.peerMap.get(bucketId);
		if (!bucket) {
			return undefined;
		}

		const bucketPeerIds = Array.from(bucket.keys());
		const randomPeerIndex = Math.floor(Math.random() * bucketPeerIds.length);
		const randomPeerId = bucketPeerIds[randomPeerIndex];
		const randomPeer = bucket.get(randomPeerId);
		bucket.delete(randomPeerId);

		return randomPeer;
	}
}
