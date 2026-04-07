export interface WorkItem {
	fields: Fields;
	id: number;
	multilineFieldsFormat: unknown;
	relations: unknown;
	rev: number;
	url: string;
	commentVersionRef?: CommentVersionRef;
}

export interface Fields {
	"System.AssignedTo"?: SystemAssignedTo;
	"System.Id": number;
	"System.IterationPath": string;
	"System.State": string;
	"System.Tags": string;
	"System.Title": string;
	"System.WorkItemType": string;
}

export interface SystemAssignedTo {
	_links: Links;
	descriptor: string;
	displayName: string;
	id: string;
	imageUrl: string;
	uniqueName: string;
	url: string;
}

export interface Links {
	avatar: Avatar;
}

export interface Avatar {
	href: string;
}

export interface CommentVersionRef {
	commentId: number;
	url: string;
	version: number;
}
