"use babel";
/** @jsx etch.dom */

const {Disposable, CompositeDisposable} = require('via');
const etch = require('etch');
const axios = require('axios');
const _ = require('underscore-plus');
const moment = require('moment');
const ViaTable = require('via-table');
const base = 'via://alerts/manage';
const url = 'https://data.via.world/api/v1/alerts';

module.exports = class AlertManager {
    static deserialize({manager, omnibar}, state){
        return new AlertManager({manager, omnibar}, state);
    }

    serialize(){
        return {
            deserializer: 'AlertManager'
        };
    }

    constructor({manager, omnibar}, state){
        this.manager = manager;
        this.disposables = new CompositeDisposable();
        this.alerts = this.manager.valid();

        this.disposables.add(this.manager.onDidUpdateAlert(this.update.bind(this)));
        this.disposables.add(this.manager.onDidDestroyAlert(this.update.bind(this)));
        this.disposables.add(this.manager.onDidCreateAlert(this.update.bind(this)));
        // this.disposables.add(via.config.observe('alerts.hideZeroValues', this.update.bind(this)));

        this.columns = [
            {
                name: 'market',
                title: 'Market',
                default: true,
                accessor: alert => alert.market.title
            },
            {
                name: 'type',
                title: 'Type',
                default: true,
                accessor: alert => alert.type
            },
            {
                name: 'direction',
                title: 'Direction',
                default: true,
                accessor: alert => alert.direction
            },
            {
                name: 'value',
                title: 'Value',
                default: true,
                accessor: alert => alert.value.toFixed(alert.market.precision.price)
            },
            {
                name: 'created',
                title: 'Created',
                default: true,
                accessor: alert => alert.created ? moment(alert.created).format('YYYY-MM-DD HH:mm:ss') : '-'
            },
            {
                name: 'updated',
                title: 'Updated',
                default: false,
                accessor: alert => alert.updated ? moment(alert.updated).format('YYYY-MM-DD HH:mm:ss') : '-'
            },
            {
                name: 'expiration',
                title: 'Expiration',
                default: false,
                accessor: alert => alert.expiration ? moment(alert.expiration).format('YYYY-MM-DD HH:mm:ss') : '-'
            },
            {
                name: 'status',
                title: 'Status',
                default: true,
                accessor: alert => alert.status
            },
            {
                name: 'triggered',
                title: 'Last Triggered',
                default: true,
                accessor: alert => alert.last ? moment(alert.last.created).format('YYYY-MM-DD HH:mm:ss') : '-'
            },
            {
                name: 'kill',
                title: 'Cancel Upon Trigger',
                default: false,
                accessor: alert => alert.kill ? 'Yes' : 'No'
            },
            {
                name: 'cooldown',
                title: 'Cooldown Time',
                default: false,
                accessor: alert => alert.cooldown ? `${alert.cooldown}s` : '-'
            },
            {
                name: 'options',
                title: 'Options',
                default: true,
                element: alert => {
                    if(alert.isDone()){
                        return (<div className='td'>-</div>);
                    }

                    if(alert.isOpen()){
                        return (
                            <div className='td'>
                                <a class='option cancel' onclick={() => alert.cancel()}>Cancel Alert</a>
                            </div>
                        );
                    }

                    if(alert.isPending()){
                        return (
                            <div className='td'>
                                <a class='option transmit' onclick={() => alert.transmit()}>Transmit Alert</a>
                            </div>
                        );
                    }

                    return (<div className='td'>-</div>);
                }
            }
        ];

        etch.initialize(this);

        this.disposables.add(via.commands.add(this.element, 'alerts:cancel-all', this.cancelAll.bind(this)));
        this.disposables.add(via.commands.add(this.element, 'alerts:cancel-alert', this.cancel.bind(this)));
        this.disposables.add(via.commands.add(this.element, 'alerts:open-chart', this.openChart.bind(this)));
    }

    openChart(e){
        const row = e.target.closest('.alert-item');

        if(row && row.dataset.uuid){
            const alert = this.manager.find(row.dataset.uuid);
            via.workspace.open(`via://charts/market/${alert.market.uri()}`);
        }
    }

    cancelAll(e){
        e.preventDefault();

        //TODO Confirm cancel all

        axios.delete(url, via.user.headers())
        .then(response => via.console.alert('All alerts canceled.'))
        .catch(error => via.console.error('Failed to cancel all alerts.', error.toString));
    }

    cancel(e){
        const row = e.target.closest('.alert-item');

        if(row && row.dataset.uuid){
            const alert = this.manager.find(row.dataset.uuid);
            alert.isOpen() ? alert.cancel() : alert.destroy();
        }
    }

    destroy(){
        this.disposables.dispose();
        etch.destroy(this);
    }

    update(){
        this.alerts = this.manager.valid();
        etch.update(this);
    }

    render(){
        return (
            <div className='alerts'>
                <ViaTable columns={this.columns} data={this.alerts} properties={this.properties}></ViaTable>
            </div>
        );
    }

    properties(alert){
        return {
            classList: `tr alert-item ${alert.status}`,
            dataset: {uuid: alert.uuid}
        };
    }

    getTitle(){
        return 'Manage Alerts';
    }

    getURI(){
        return base;
    }
}
