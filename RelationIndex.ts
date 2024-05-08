type EntityID = string;

interface RelationIndex {
  [relationType: string]: {
    bySource: { [sourceEntityID: string]: EntityID[] };
    byTarget: { [targetEntityID: string]: EntityID[] };
  };
}

export const relationIndex: RelationIndex = {};

export function addToIndex(relationType: string, sourceEntityID: EntityID, targetEntityID: EntityID, relationEntityID: EntityID): void {
  if (!relationIndex[relationType]) {
    relationIndex[relationType] = { bySource: {}, byTarget: {} };
  }
  if (!relationIndex[relationType].bySource[sourceEntityID]) {
    relationIndex[relationType].bySource[sourceEntityID] = [];
  }
  if (!relationIndex[relationType].byTarget[targetEntityID]) {
    relationIndex[relationType].byTarget[targetEntityID] = [];
  }

  relationIndex[relationType].bySource[sourceEntityID].push(relationEntityID);
  relationIndex[relationType].byTarget[targetEntityID].push(relationEntityID);
}

export function removeFromIndex(relationType: string, sourceEntityID: EntityID, targetEntityID: EntityID, relationEntityID: EntityID): void {
  relationIndex[relationType].bySource[sourceEntityID] = relationIndex[relationType].bySource[sourceEntityID].filter(id => id !== relationEntityID);
  relationIndex[relationType].byTarget[targetEntityID] = relationIndex[relationType].byTarget[targetEntityID].filter(id => id !== relationEntityID);
}

export function updateIndex(
  relationType: string,
  relationEntityID: EntityID,
  oldSourceEntityID: EntityID,
  oldTargetEntityID: EntityID,
  newSourceEntityID?: EntityID,
  newTargetEntityID?: EntityID,
): void {
  if (newSourceEntityID && oldSourceEntityID !== newSourceEntityID) {
    removeFromIndex(relationType, oldSourceEntityID, oldTargetEntityID, relationEntityID);
    addToIndex(relationType, newSourceEntityID, oldTargetEntityID, relationEntityID);
  }

  if (newTargetEntityID && oldTargetEntityID !== newTargetEntityID) {
    removeFromIndex(relationType, oldSourceEntityID, oldTargetEntityID, relationEntityID);
    addToIndex(relationType, oldSourceEntityID, newTargetEntityID, relationEntityID);
  }
}
