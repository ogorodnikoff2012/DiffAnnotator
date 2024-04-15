import React, {useEffect, useMemo, useState} from 'react';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Stack from 'react-bootstrap/Stack';
import Card from 'react-bootstrap/Card';
import 'bootstrap/dist/css/bootstrap.min.css';
import "bootstrap-icons/bootstrap-icons.svg"
import {Button, ListGroup, Modal} from "react-bootstrap";
import {Hunk, ParsedDiff, parsePatch} from "diff";
import {NIL, v4 as uuidv4} from "uuid";
import {useMap} from "usehooks-ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCancel, faFilter, faPencil, faSave, faTrash} from "@fortawesome/free-solid-svg-icons";
import {saveAs} from "file-saver";

type UUID = string & { _uuidBrand: undefined };
type ReadOnlyMap<K, V> = Omit<Map<K, V>, 'set' | 'clear' | 'delete'>;

const NULL_UUID = NIL as UUID;

function generateUUID(): UUID {
    return uuidv4() as UUID;
}

function HunkLineView({line}: { line: string }) {
    let className: string;
    if (line.length === 0) {
        className = "text-body";
    } else if (line[0] === '+') {
        className = "text-success";
    } else if (line[0] === '-') {
        className = "text-danger";
    } else {
        className = "text-body";
    }
    return <><span className={className}>{line}</span><br/></>;
}

function HunkView(
    {
        fileDiff,
        hunk,
        onLabelChange,
        labelMap,
        selectedLabelId,
    }: {
        fileDiff: ParsedDiff,
        hunk: Hunk,
        onLabelChange: (hunk: Hunk, newLabelId?: UUID) => void,
        labelMap: ReadOnlyMap<UUID, string>,
        selectedLabelId?: UUID,
    }) {
    const setSelectedLabelId = (id?: UUID) => {
        onLabelChange(hunk, id);
    };

    useEffect(() => {
        if (selectedLabelId && !labelMap.has(selectedLabelId)) {
            setSelectedLabelId(undefined);
        }
    }, [labelMap]);

    return <Card>
        <Card.Header className={[selectedLabelId ? "bg-success" : "bg-danger", "text-light"].filter(c => c).join(" ")}>
            <Form.Select onChange={(e) => setSelectedLabelId(e.target.value as UUID)} value={selectedLabelId}>
                <>
                    <option>Choose label</option>
                    {
                        Array.from(labelMap.entries()).map(([id, label]) => <option key={id}
                                                                                    value={id}>{label}</option>)
                    }
                </>
            </Form.Select>
        </Card.Header>
        <Card.Body>
            <div>
                <h5>
            <pre>
                ---{fileDiff.oldFileName}
                <br/>
                +++{fileDiff.newFileName}
            </pre>
                </h5>
                <h6>
                    <pre>@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</pre>
                </h6>
                <div>
            <pre>
                {hunk.lines.map(line => <HunkLineView line={line}/>)}
            </pre>
                </div>
            </div>
        </Card.Body>
    </Card>;
}

function LabelView({
                       label, labelId, changeLabel, removeLabel, addToFilter, removeFromFilter
                   }: {
    label: string,
    labelId: UUID,
    changeLabel: (id: UUID, newLabel: string) => void,
    removeLabel: (id: UUID) => void,
    addToFilter: (id: UUID) => void,
    removeFromFilter: (id: UUID) => void,
}) {
    const [editMode, setEditMode] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [inFilter, setInFilter] = useState(false);

    const startEdit = () => {
        setNewLabel(label);
        setEditMode(true);
    };

    const abortEdit = () => {
        setEditMode(false);
    };

    const commitEdit = () => {
        changeLabel(labelId, newLabel);
        setEditMode(false);
    };

    useEffect(() => {
        if (inFilter) {
            addToFilter(labelId);
        } else {
            removeFromFilter(labelId);
        }
    }, [inFilter]);

    return <div className="d-flex">
        {
            editMode ?
                <>
                    <Form.Control type="text" className="flex-fill" value={newLabel}
                                  onChange={(e) => setNewLabel(e.target.value)} size="sm"/>
                    <Button size="sm" onClick={abortEdit} variant="outline-danger" className="ms-1">
                        <FontAwesomeIcon icon={faCancel}/>
                    </Button>
                    <Button size="sm" onClick={commitEdit} variant="outline-success" className="ms-1">
                        <FontAwesomeIcon icon={faSave}/>
                    </Button>
                </> :
                <>
                    <span className="flex-fill">{label}</span>
                    <Button onClick={() => setInFilter(flag => !flag)}
                            variant={inFilter ? "primary" : "outline-primary"}
                            className="ms-1">
                        <FontAwesomeIcon icon={faFilter}/>
                    </Button>
                    <Button size="sm" onClick={startEdit} variant="outline-primary" className="ms-1">
                        <FontAwesomeIcon icon={faPencil}/>
                    </Button>
                </>
        }
        <Button size="sm" onClick={() => removeLabel(labelId)} variant="danger" className="ms-1">
            <FontAwesomeIcon icon={faTrash}/>
        </Button>
    </div>;
}

function App() {
    const [rawData, setRawData] = useState({isJSON: false, text: ""});
    const [showModal, setShowModal] = useState(false);
    const [errorHead, setErrorHead] = useState("");
    const [errorBody, setErrorBody] = useState("");

    const [newLabel, setNewLabel] = useState("")

    const [labelMap, labelMapActions] = useMap<UUID, string>();
    const [hunkMap, hunkMapActions] = useMap<Hunk, UUID>();

    const [labelFilter, labelFilterActions] = useMap<UUID, undefined>();

    const showError = (e: Error) => {
        setErrorHead(e.name);
        setErrorBody(e.message + '\n' + e.stack);
        setShowModal(true);
    };

    const importLabel = (label: string) => {
        const id = generateUUID();
        labelMapActions.set(id, label);
        return id;
    };

    const diff = useMemo(() => {
        hunkMapActions.reset();

        if (rawData.isJSON) {
            const data: { [label: string]: ParsedDiff[] } = JSON.parse(rawData.text);
            labelMapActions.reset();

            const result: ParsedDiff[] = [];

            Object.entries(data).forEach(([label, parsedDiffs]) => {
                const id = importLabel(label);
                parsedDiffs.forEach(parsedDiff => parsedDiff.hunks.forEach(hunk => hunkMapActions.set(hunk, id)));
                result.push(...parsedDiffs);
            });

            return result;
        } else {
            return parsePatch(rawData.text);
        }
    }, [rawData]);

    const addLabel = () => {
        if (newLabel.length === 0) {
            return;
        }
        labelMapActions.set(generateUUID(), newLabel);
        setNewLabel("");
    };

    const changeLabel = (id: UUID, newLabel: string) => {
        labelMapActions.set(id, newLabel);
    };

    const removeLabel = (id: UUID) => {
        labelMapActions.remove(id);
    };

    const onHunkLabelChange = (hunk: Hunk, newLabelId?: UUID) => {
        if (newLabelId === undefined) {
            hunkMapActions.remove(hunk);
        } else {
            hunkMapActions.set(hunk, newLabelId);
        }
    };

    const changesCount = useMemo(() => diff.map(fileDiff => fileDiff.hunks.length).reduce((acc, x) => acc + x, 0), [diff]);

    const addToFilter = (id: UUID) => {
        labelFilterActions.set(id, undefined);
    };

    const removeFromFilter = (id: UUID) => {
        labelFilterActions.remove(id);
    }

    const exportAsJSON = () => {
        const map = new Map<UUID, Map<string, ParsedDiff>>();
        diff.forEach(fileDiff => fileDiff.hunks.forEach(hunk => {
            const uuid = hunkMap.get(hunk) || NULL_UUID;
            if (!map.has(uuid)) {
                map.set(uuid, new Map());
            }
            const innerMap = map.get(uuid) as Map<string, ParsedDiff>;
            const {oldFileName, newFileName} = fileDiff;
            const key = JSON.stringify([oldFileName, newFileName]);
            if (!innerMap.has(key)) {
                innerMap.set(key, {...fileDiff, hunks: []});
            }
            const syntheticDiff = innerMap.get(key) as ParsedDiff;
            syntheticDiff.hunks.push(hunk);
        }));

        const object: { [id: string]: ParsedDiff[] } = {};
        map.forEach((innerMap, id) => {
            object[labelMap.get(id) || "undefined"] = Array.from(innerMap.values());
        });

        const text = JSON.stringify(object, null, 2);
        const blob = new Blob([text], {type: "application/json"});
        saveAs(blob, "annotated_diff.json");
    };

    return <>
        <Modal show={showModal} onHide={() => setShowModal(false)}>
            <Modal.Header closeButton>
                <Modal.Title>{errorHead}</Modal.Title>
            </Modal.Header>
            <Modal.Body>{errorBody.split('\n').map(line => <>{line}<br/></>)}</Modal.Body>
        </Modal>
        <Navbar className="justify-content-between">
            <Container>
                <Navbar.Brand>Diff Annotator</Navbar.Brand>
                <div>
                    Number of changes: {changesCount}
                    <br/>
                    Number of uncategorized changes: {changesCount - hunkMap.size}
                </div>
                <Form className="d-flex">
                    <Form.Group controlId="inputFile">
                        <Form.Label>Your .diff or .json file:</Form.Label>
                        <Form.Control type="file" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const inputNode = e.target;
                            if (!inputNode.files || inputNode.files.length === 0) {
                                return;
                            }

                            const file = inputNode.files[0];
                            const reader = new FileReader();
                            const isJSON = file.name.endsWith("json");
                            reader.onload = (e) => {
                                const target = e.target;
                                if (!target) {
                                    return;
                                }
                                const result = target.result;
                                if (typeof result !== "string") {
                                    return;
                                }
                                setRawData({isJSON, text: result});
                            };
                            reader.onerror = (e) => {
                                const target = e.target;
                                if (!target) {
                                    return;
                                }
                                showError(target.error || new Error("Unknown error"));
                            }
                            reader.readAsText(file);
                        }}></Form.Control>
                    </Form.Group>
                </Form>
                <Button onClick={exportAsJSON}>Export as JSON</Button>
            </Container>
        </Navbar>
        <Container fluid>
            <Row>
                <Col style={{overflowY: "scroll", height: "calc(100vh - 100px)"}}>
                    <Stack gap={3}>
                        {diff.flatMap(fileDiff => fileDiff.hunks
                            .filter(hunk => labelFilter.size === 0 || !hunkMap.has(hunk) || labelFilter.has(hunkMap.get(hunk) as UUID))
                            .map(hunk =>
                                <HunkView
                                    key={`${fileDiff.oldFileName}_${fileDiff.newFileName}_${hunk.oldStart}_${hunkMap.get(hunk)}`}
                                    fileDiff={fileDiff}
                                    hunk={hunk}
                                    labelMap={labelMap}
                                    onLabelChange={onHunkLabelChange}
                                    selectedLabelId={hunkMap.get(hunk)}
                                />)
                            .reduce((acc, x) => {
                                console.assert(x.key != null && !acc.keys.has(x.key));
                                acc.keys.add(x.key as string);
                                acc.elements.push(x);
                                return acc;
                            }, {
                                keys: new Set<string>(),
                                elements: [] as JSX.Element[],
                            })
                            .elements
                        )}
                    </Stack>
                </Col>
                <Col style={{overflowY: "scroll", height: "calc(100vh - 100px)"}}>
                    <Form className={"mb-3 mt-3"} onSubmit={(e) => {
                        e.preventDefault();
                        addLabel();
                    }}>
                        <Form.Group controlId="addNewLabel" className="input-group">
                            <Form.Control type="text" value={newLabel}
                                          onChange={(e) => setNewLabel(e.target.value)}
                                          placeholder="New label"
                            />
                            <Button onClick={addLabel}>Add</Button>
                        </Form.Group>
                    </Form>
                    <ListGroup>
                        {Array.from(labelMap.entries()).map(([id, label]) =>
                            <ListGroup.Item key={id}>
                                <LabelView label={label} labelId={id} changeLabel={changeLabel}
                                           removeLabel={removeLabel} addToFilter={addToFilter}
                                           removeFromFilter={removeFromFilter}/>
                            </ListGroup.Item>)}
                    </ListGroup>
                </Col>
            </Row>
        </Container>
    </>
        ;
}

export default App;
