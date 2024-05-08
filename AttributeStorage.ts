import { logInternal } from "./debug/Log";
import { createEntity } from "./EntityManagement";
import { updateIndex, relationIndex, addToIndex, removeFromIndex } from "./RelationIndex";
import { ECS } from "./config/types";
import { isObject } from "./utils";

type EntityID = string;
type AttributeValue = any;

interface RelationDetail {
  sourceEntity: EntityID;
  targetEntity: EntityID;
  relationType: string;
  info?: AttributeValue;
}

interface AttributeTypeMap {
  [entityID: string]: AttributeValue[];
}

interface AttributeStore {
  [attributeType: string]: AttributeTypeMap;
}

const attributeStore: AttributeStore = {};

function addAttribute(entityID: EntityID, attributeType: string, value: AttributeValue): void {
  if (!attributeStore[attributeType]) {
    attributeStore[attributeType] = {};
  }

  if (!attributeStore[attributeType][entityID]) {
    attributeStore[attributeType][entityID] = []; // many attributes of the same type allowed
  }

  attributeStore[attributeType][entityID].push(value);

  logInternal('AA', false, attributeType, entityID, value);
}

function addRole(entityID: EntityID, roleName: string): void {
  addAttribute(entityID, 'role', roleName);
}

// function addStatus(entityID: EntityID, roleName: string): void {
//   addAttribute(entityID, 'status', roleName);
// }

// function addState(entityID: EntityID, state: string): void {
//   addAttribute(entityID, 'status', roleName);
// }

function addRelation(sourceEntityID: EntityID, relationType: string, targetEntityID: EntityID, info?: AttributeValue): EntityID {
  const relationEntityID = createEntity(ECS.Entity.Relation, true);
  const relationDetails: RelationDetail = {
    sourceEntity: sourceEntityID,
    targetEntity: targetEntityID,
    relationType,
    info
  };

  addAttribute(relationEntityID, 'relationDetails', relationDetails);
  addToIndex(relationType, sourceEntityID, targetEntityID, relationEntityID);
  return relationEntityID;
}

function updateAttribute(entityID: EntityID, attributeType: string, newValue: AttributeValue, index: number = 0) {
  if (!attributeStore[attributeType]) {
    attributeStore[attributeType] = {};
  }

  const currentAttribute = getAttribute(entityID, attributeType);

  if (currentAttribute && isObject(currentAttribute) && isObject(newValue)) {
    attributeStore[attributeType][entityID][index] = { ...currentAttribute, ...newValue };
  } else {
    attributeStore[attributeType][entityID][index] = newValue;
  }
  logInternal('AU', false, attributeType, entityID, newValue);
}

function updateAttributeByCriteria(entityID: EntityID, attributeType: string, criteria: AttributeValue, newValue: AttributeValue): void {
  const index = getAttributeIndexByCriteria(entityID, attributeType, criteria);
  if (index !== -1) {
    updateAttribute(entityID, attributeType, newValue, index);
  }
}

// Update a role for an entity
function updateRole(entityID: EntityID, oldRoleName: string, newRoleName: string): void {
  const roles = getAttributes(entityID, 'role');
  const roleIndex = roles.indexOf(oldRoleName);
  if (roleIndex !== -1) {
    roles[roleIndex] = newRoleName; // Update the role
    updateAttribute(entityID, 'role', roles); // Update the attribute in the store
  }
}

function updateRelation(relationEntityID: EntityID, newSourceEntityID?: EntityID, newTargetEntityID?: EntityID, newInfo?: AttributeValue): void {
  const relationDetails = getAttribute(relationEntityID, 'relationDetails') as RelationDetail | null;

  if (!relationDetails) return;
  
  let shouldUpdateIdx = false;
  const oldSourceEntityID = relationDetails.sourceEntity;
  const oldTargetEntityID = relationDetails.targetEntity;

  if (newSourceEntityID && newSourceEntityID !== oldSourceEntityID) {
    relationDetails.sourceEntity = newSourceEntityID;
    shouldUpdateIdx = true;
  }
  if (newTargetEntityID && newTargetEntityID !== oldTargetEntityID) {
    relationDetails.targetEntity = newTargetEntityID;
    shouldUpdateIdx = true;
  }
  if (newInfo !== undefined) relationDetails.info = newInfo;

  updateAttribute(relationEntityID, 'relationDetails', relationDetails);

  if (shouldUpdateIdx) {
    updateIndex(
      relationDetails.relationType,
      relationEntityID,
      oldSourceEntityID, oldTargetEntityID,
      newSourceEntityID, newTargetEntityID,
    );
  }
}
function removeAttribute(entityID: EntityID, attributeType: string, index: number = 0): void {
  const typeMap = attributeStore[attributeType];
  let value;
  if (typeMap && typeMap[entityID]) {
    value = typeMap[entityID][index];
    typeMap[entityID].splice(index, 1);
  }
  if (typeMap[entityID]?.length === 0) {
    delete typeMap[entityID];
  }
  logInternal('AR', false, attributeType, entityID, value);
}

function removeAttributeByCriteria(entityID: EntityID, attributeType: string, criteria: AttributeValue): void {
  const index = getAttributeIndexByCriteria(entityID, attributeType, criteria);
  if (index !== -1) {
    removeAttribute(entityID, attributeType, index);
  }
}

function removeRelation(relationEntityID: EntityID): void {
  const relationDetails = getRelation(relationEntityID);
  if (relationDetails) {
    removeFromIndex(
      relationDetails.relationType,
      relationDetails.sourceEntity,
      relationDetails.targetEntity,
      relationEntityID
    );
    destroyEntity(relationEntityID);
    // removeAttribute(relationEntityID, 'relationDetails'); // just remove the relation details
  }
}

function removeRole(entityID: EntityID, roleName: string): void {
  removeAttributeByCriteria(entityID, 'role', roleName)
}

function getAttributeIndexByCriteria(entityID: EntityID, attributeType: string, criteria: AttributeValue): number {
  const attributes = getAttributes(entityID, attributeType);
  return attributes.findIndex(attribute => isObject(criteria)
    ? Object.entries(criteria).every(([key, value]) => attribute[key] === value)
    : attribute === criteria
  );
}

function getAttributes(entityID: EntityID, attributeType: string): AttributeValue[] {
  return attributeStore[attributeType]?.[entityID] || [];
}

function getAttribute(entityID: EntityID, attributeType: string, index: number = 0): AttributeValue | null {
  const attributes = getAttributes(entityID, attributeType);
  return attributes.length > index ? attributes[index] : null;
}

function getRoles(entityID: EntityID): string[] {
  return getAttributes(entityID, 'role') as string[];
}

function hasRole(entityID: EntityID, roleName: string): boolean {
  const roles = getAttributes(entityID, 'role');
  return roles.includes(roleName);
}

function hasRoleX(roleName: string): (item: AttributeValue) => boolean {
  return (item: AttributeValue) => hasRole(item, roleName);
}

function getRelation(relationEntityID: EntityID): RelationDetail | null {
  const relationAttributes = getAttributes(relationEntityID, 'relationDetails');
  return relationAttributes.length > 0 ? (relationAttributes[0] as RelationDetail) : null;
}

function queryEntitiesByAttribute(attributeType: string, criteria: AttributeValue): EntityID[] {
  const typeMap = attributeStore[attributeType];
  return typeMap
  ? Object.keys(typeMap)
      .filter(entityID => isObject(criteria)
        ? typeMap[entityID]
            .some(attribute => Object.entries(criteria).every(([key, value]) => attribute[key] === value))
        : typeMap[entityID].includes(criteria)
      ) 
  : [];
}

function queryEntitiesByRole(role: string): EntityID[] {
  return queryEntitiesByAttribute('role', role);
}

function queryEntitiesInRelationTo(targetEntityID: EntityID): EntityID[] {
  const getRelatedEntities = (index: { [entityID: string]: EntityID[] }, inverse: boolean) => {
    return (index[targetEntityID] || []).map(relationEntityID =>
      inverse 
      ? attributeStore['relationDetails'][relationEntityID]?.[0]?.sourceEntity 
      : attributeStore['relationDetails'][relationEntityID]?.[0]?.targetEntity
    ).filter(e => e); // Filter out any undefined entries
  };

  const relatedEntities = Object.keys(relationIndex).reduce((acc, relationType) => {
    const { bySource, byTarget } = relationIndex[relationType];
    return acc.concat(getRelatedEntities(bySource, false), getRelatedEntities(byTarget, true));
  }, [] as EntityID[]);

  return Array.from(new Set(relatedEntities)); // Return unique entities
}

function queryEntitiesByRelationTo(relationType: string, entityID: EntityID, isSource?: boolean): EntityID[] {
  const relationIDs =  relationIndex[relationType]?.[isSource ? 'bySource' : 'byTarget'][entityID] || [];
  return relationIDs.map(relationID => {
    const relationDetails = getRelation(relationID)!;
    return (isSource ? relationDetails.targetEntity : relationDetails.sourceEntity);
  }).filter(e => e); // Filter out any undefined entries
}

function destroyEntity(entityID: EntityID): void {
  Object.keys(relationIndex).forEach((relationType: string) => {
    ['bySource', 'byTarget'].forEach((indexKey) => {
      const index = relationIndex[relationType][indexKey as keyof typeof relationIndex[string]];
      if (index[entityID]) {
        index[entityID].forEach(relationEntityID => {
          const relationDetails = getRelation(relationEntityID);
          if (relationDetails) {
            // const oppositeIndexKey = relationDetails.sourceEntity === entityID ? 'byTarget' : 'bySource';
            const oppositeEntityID = relationDetails.sourceEntity === entityID ? relationDetails.targetEntity : relationDetails.sourceEntity;
      
            removeFromIndex(relationType, oppositeEntityID, entityID, relationEntityID);
            removeAttribute(relationEntityID, 'relationDetails');
          }
        });
        delete index[entityID]; // Remove the entity from the index
      }
    });
  });

  Object.keys(attributeStore).forEach(attributeType => {
    if (attributeStore[attributeType][entityID]) {
      delete attributeStore[attributeType][entityID]; // Remove the entity's attributes
    }
  });
}

export {
  // createEntity,
  destroyEntity,
  addAttribute,
  addRole,
  addRelation,
  updateAttribute,
  updateAttributeByCriteria,
  updateRole,
  updateRelation,
  removeAttribute,
  removeAttributeByCriteria,
  removeRole,
  removeRelation,
  // queries
  getAttributes,
  getAttribute,
  getRoles,
  hasRole,
  hasRoleX,
  getRelation,
  queryEntitiesByAttribute,
  queryEntitiesByRole,
  queryEntitiesInRelationTo,
  queryEntitiesByRelationTo,
}
